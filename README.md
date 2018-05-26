# AAA Tools for RADIUS/LDAP

## Building
Enter the project directory and run:
```bash
$ npm install
$ npm run-script build
```
The output file is named `get-ldap-groups.js`. In order to be able to execute it and/or integrate with Freeradius it needs to be executable. Issue the following command to make the script executable:
```bash
$ chmod +x get-ldap-groups.js
```

## Tool: Recursive LDAP group resolver for RADIUS (get-ldap-groups.ts)
This tool recursively resolves Active Directory groups and enumerates all of them as RADIUS AVPs (Attribute Value Pairs). The pair attribute can be configured as well as prefix for every value. Groups may be resolved as CN (Common Name) or as DN (Distinguished Name).

### Configuration
Create a copy of `config.sample.json` renamed to `config.json` and configure to your needs. The configuration includes the following:

* RADIUS Configuration
    * **attributeName** - name of RADIUS attribute to be output for every resolved group
    * **valuePrefix** - prefix to put in front of every group CN or DN
* LDAP Configuration
    * **host** - LDAP server
    * **port** - LDAP port
    * **user** - username or DN of user to bind on and perform searches
    * **password** - password for the binding user
    * **baseDn** - base DN to perform searches from
    * **format** - output format for group list (`cn` or `dn`)

### Freeradius 3 Integration
In order to be able to resolve groups for user, an exec module needs to be instantiated within Freeradius. Here is an example configuration for **rlm_exec** module (usually in */etc/freeradius/3.0/mods-enabled/exec*):
```
exec exec.ldap_groups {
	wait = yes
	input_pairs = request
	output_pairs = reply
	shell_escape = no
	timeout = 10
	program = "/opt/aaa-tools/get-ldap-groups.js %{User-Name}"
}
```

To use the module within a virtual server, add the following to the **authorize** section:
```
authorize {
    ...
    exec.ldap_groups
    ...
}
```

## Tool: Simple TOTP Authenticator
This tool implements simple TOTP authentication mechanism. OTP token is inserted at the end of the password by user.

### Freeradius 3 Integration
Configure the following `rlm_exec` modules. Example configuration from */etc/freeradius/3.0/mods-enabled/exec*:
```
exec exec.totp_auth {
	wait = yes
    input_pairs = request
    output_pairs = request
    shell_escape = no
    timeout = 10
    program = "/opt/aaa-tools/simple-totp-auth.js authenticate %{User-Password} %{TOTP-Secret}"
}
```


The following dictionary item is required in `dictionary` file:
```
ATTRIBUTE	TOTP-Secret		3000	string
```

In your virtual server add the following to the `authenticate` section (usually before the main authentication module):
```
authorize {
    ...
    if (&control:TOTP-Secret =* ANY) {
        exec.totp_auth
    }
    ...
}
```
This configuration requires OTP authentication if `TOTP-Secret` is configured for user. You can change the configuration to enforce it for every user and disable authentication without second factor (TOTP).

### Setup Freeradius 3 User
You can deliver the `TOTP-Secret` in any way you consider fit for your user case (eg. SQL, LDAP or files module). This sample shows a user configured through the `rlm_files` module using the */etc/freeradius/3.0/users* file:
```
test01  TOTP-Secret := PEZDMZJQMYVXMS3TNJHW2TRWIZHGMZKL
```

Secrets can be generated in various ways, but the tool has a built-in generator:
```bash
$ /opt/aaa-tools/simple-totp-auth.js generate
```
