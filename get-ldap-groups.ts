#!/usr/bin/env node

import * as ldapjs from "ldapjs";
import * as fs from "mz/fs";
import * as path from "path";
import * as process from "process";
import "reflect-metadata";
import { Observable } from "rxjs";
import "rxjs/add/observable/fromEvent";
import "rxjs/add/operator/first";
import * as util from "util";

enum GroupOutputFormat {
	CN = "cn",
	DN = "dn"
}

interface Config {
	radius: {
		attributeName: string;
		valuePrefix: string;
	},
	ldap: {
		host: string;
		port: number;
		user: string;
		password: string;
		baseDn: string;
		timeout: number;
		format: GroupOutputFormat;
	}
}

class RecursiveLdapGroupResolver {

	private config: Config;
	private ldapClient: ldapjs.Client;

	public async run(): Promise<void> {
		try {
			// 1. Load configuration
			const configPath = path.join(__dirname, "config.json");
			this.config = JSON.parse(fs.readFileSync(configPath, "utf8"));

			// 2. Load input username
			const username = process.env["USER_NAME"] || process.argv[2];
			if (!username) {
				this.exit(new Error("no username passed"));
			}

			// 3. Connect to LDAP
			this.ldapClient = ldapjs.createClient({
				url: util.format("ldap://%s:%d", this.config.ldap.host, this.config.ldap.port),
				timeout: this.config.ldap.timeout,
				connectTimeout: this.config.ldap.timeout
			});
			Observable.fromEvent(this.ldapClient, "error").first().subscribe(error => this.exit(error as Error));
			await util.promisify(this.ldapClient.bind).bind(this.ldapClient)(this.config.ldap.user, this.config.ldap.password);

			// 4. Resolve attribute-value pairs for user and print them
			const avPairs = await this.resolve(username);
			avPairs.forEach(pair => console.log(pair));
			return this.exit();
		} catch (error) {
			return this.exit(error);
		}
	}

	private async resolve(username: string): Promise<string[]> {
		const entry = await this.getUserLdapEntry(username);
		let dn = entry.objectName.toString();
		let memberOfDns = this.populateAttributeValues(entry, "memberOf");

		const groups: string[] = [];
		groups.push(...memberOfDns);
		for (const groupDn of memberOfDns) {
			await this.processGroupDn(groupDn, groups);
		}

		let pairs: string[];
		if (this.config.ldap.format === GroupOutputFormat.CN) {
			pairs = groups.map(gdn => /CN=(.+?),.*$/.exec(gdn)[1]).map(gcn => util.format("%s += \"%s%s\"", this.config.radius.attributeName, this.config.radius.valuePrefix, gcn));
		} else {
			pairs = groups.map(gdn => util.format("%s += \"%s%s\"", this.config.radius.attributeName, this.config.radius.valuePrefix, gdn));
		}
		return pairs;
	}

	private async getUserLdapEntry(username: string): Promise<any> {
		let userEntry;
		const searchOptions = {
			filter: util.format("(&(sAMAccountName=%s)(objectClass=user))", username),
			scope: "sub",
			attributes: ["memberOf"]
		};
		const result = await util.promisify(this.ldapClient.search).bind(this.ldapClient)(this.config.ldap.baseDn, searchOptions);
		Observable.fromEvent(result, "error").first().subscribe(error => this.exit(error as Error));
		Observable.fromEvent(result, "searchEntry").first().subscribe(entry => userEntry = entry);
		await Observable.fromEvent(result, "end").first().toPromise();
		if (!userEntry) {
			return this.exit(new Error("user dn not found for " + username));
		}
		return userEntry;
	}

	private async processGroupDn(dn: string, targetGroups: string[]): Promise<void> {
		let groupEntry;
		const result = await util.promisify(this.ldapClient.search).bind(this.ldapClient)(dn, { attributes: ["memberOf"] });
		Observable.fromEvent(result, "error").first().subscribe(error => this.exit(error as Error));
		Observable.fromEvent(result, "searchEntry").first().subscribe(entry => groupEntry = entry);
		await Observable.fromEvent(result, "end").first().toPromise();
		if (groupEntry) {
			let memberOfDns = this.populateAttributeValues(groupEntry, "memberOf");
			for (const memberOfDn of memberOfDns) {
				if (targetGroups.indexOf(memberOfDn) === -1) {
					targetGroups.push(memberOfDn);
					await this.processGroupDn(memberOfDn, targetGroups);
				}
			}
		}
	}

	private populateAttributeValues(entry: any, type: string): string[] {
		return entry.attributes.filter(a => a.type === type).map(a => a._vals.map(v => v.toString())).reduce((cur, acc) => { acc.push(...cur); return acc; }, [])
	}

	private async exit(error?: Error): Promise<void> {
		if (this.ldapClient) {
			await util.promisify(this.ldapClient.unbind).bind(this.ldapClient)();
		}
		if (error) {
			console.log("ERROR:", error);
			return process.exit(2);
		}
		return process.exit(0);
	}
}

const resolver = new RecursiveLdapGroupResolver();
resolver.run();
