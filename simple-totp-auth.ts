#!/usr/bin/env node

import * as otplib from "otplib";
import * as process from "process";
import * as util from "util";

class SimpleTotpAuthenticator {
    public runAuthenticate(password: string, secret: string): void {
        if (password.length < 6 || !/[0-9]{6}$/.test(password)) {
            return this.exit(new Error("password does not end with otp token"));
        }
        const token = /([0-9]{6})$/.exec(password)[1];
        (otplib.authenticator as any).options = {
            window: 1
        };
        if (otplib.authenticator.verify({ secret, token })) {
            const cleanPassword = /(.*)[0-9]{6}$/.exec(password)[1];
            console.log(util.format("User-Password := %s", cleanPassword));
            console.log(util.format("Cleartext-Password := %s", cleanPassword));
            return this.exit();
        } else {
            return this.exit(new Error("otp token invalid"));
        }
    }

    public runCleanup(password: string): void {
        if (password.length < 6 || !/[0-9]{6}$/.test(password)) {
            return this.exit(new Error("password does not end with otp token"));
        }
        const cleanPassword = /(.*)[0-9]{6}$/.exec(password)[1];
        console.log(util.format("User-Password := %s", cleanPassword));
        console.log(util.format("Cleartext-Password := %s", cleanPassword));
        return this.exit();
    }

    public runGenerateSecret(): void {
        console.log(otplib.authenticator.generateSecret());
        return this.exit();
    }

    private exit(error?: Error): void {
        if (error) {
            console.log("ERROR:", error.message);
            return process.exit(2);
        }
        return process.exit(0);
    }
}

const command = process.argv[2] || null;
const authenticator = new SimpleTotpAuthenticator();
switch (command) {
    case "authenticate": {
        const password = process.env["USER_PASSWORD"] || process.env["CLEARTEXT_PASSWORD"] || process.argv[3] || null;
        const secret = process.env["TOTP_SECRET"] || process.argv[4] || null;
        authenticator.runAuthenticate(password, secret);
        break;
    }
    case "cleanup": {
        const password = process.env["USER_PASSWORD"] || process.env["CLEARTEXT_PASSWORD"] || process.argv[3] || null;
        authenticator.runCleanup(password);
        break;
    }
    case "generate": {
        authenticator.runGenerateSecret();
        break;
    }
    default: {
        console.log("Unknown command");
        process.exit(1);
    }
}
