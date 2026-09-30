// Idempotently applies App Store hardening to the generated Capacitor iOS project:
//  - Info.plist: export-compliance flag, arm64, portrait-only iPhone, game category
//  - PrivacyInfo.xcprivacy (required-reason API declarations, no tracking, no data collected) wired into the Xcode target
//  - the Declared Age Range plugin (AgeRangePlugin.swift + MainViewController.swift), its entitlement, and weak linking so
//    the app still launches on iOS versions without the framework
// Safe to re-run. Use after `npx cap add ios`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appDir = path.join(root, 'ios/App/App');
if (!fs.existsSync(appDir)) { console.error('ios/ not found — run `npx cap add ios` first.'); process.exit(1); }

// ---------------- Info.plist
const plistPath = path.join(appDir, 'Info.plist');
let plist = fs.readFileSync(plistPath, 'utf8');
const has = (k) => plist.includes(`<key>${k}</key>`);
plist = plist.replace(/(<key>UIRequiredDeviceCapabilities<\/key>\s*<array>\s*)<string>armv7<\/string>/, '$1<string>arm64</string>');
plist = plist.replace(/(<key>UISupportedInterfaceOrientations<\/key>\s*<array>)[\s\S]*?(<\/array>)/, '$1\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t$2');
const extra = [];
if (!has('ITSAppUsesNonExemptEncryption')) extra.push('\t<key>ITSAppUsesNonExemptEncryption</key>\n\t<false/>');
if (!has('LSApplicationCategoryType')) extra.push('\t<key>LSApplicationCategoryType</key>\n\t<string>public.app-category.games</string>');
if (!has('UIStatusBarStyle')) extra.push('\t<key>UIStatusBarStyle</key>\n\t<string>UIStatusBarStyleLightContent</string>');
if (extra.length) plist = plist.replace(/<\/dict>\s*<\/plist>\s*$/, `${extra.join('\n')}\n</dict>\n</plist>\n`);
fs.writeFileSync(plistPath, plist);

// ---------------- PrivacyInfo.xcprivacy
const privacy = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>NSPrivacyTracking</key>
	<false/>
	<key>NSPrivacyTrackingDomains</key>
	<array/>
	<key>NSPrivacyCollectedDataTypes</key>
	<array/>
	<key>NSPrivacyAccessedAPITypes</key>
	<array>
		<dict>
			<key>NSPrivacyAccessedAPIType</key>
			<string>NSPrivacyAccessedAPICategoryUserDefaults</string>
			<key>NSPrivacyAccessedAPITypeReasons</key>
			<array>
				<string>CA92.1</string>
			</array>
		</dict>
		<dict>
			<key>NSPrivacyAccessedAPIType</key>
			<string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
			<key>NSPrivacyAccessedAPITypeReasons</key>
			<array>
				<string>C617.1</string>
			</array>
		</dict>
	</array>
</dict>
</plist>
`;
fs.writeFileSync(path.join(appDir, 'PrivacyInfo.xcprivacy'), privacy);

// ---------------- wire it into project.pbxproj
const pbxPath = path.join(root, 'ios/App/App.xcodeproj/project.pbxproj');
let pbx = fs.readFileSync(pbxPath, 'utf8');
if (!pbx.includes('PrivacyInfo.xcprivacy')) {
  const BUILD = 'A11CE0DE1FED79650016851F', REF = 'A11CE0DF1FED79650016851F';
  pbx = pbx.replace('/* Begin PBXBuildFile section */', `/* Begin PBXBuildFile section */\n\t\t${BUILD} /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = ${REF} /* PrivacyInfo.xcprivacy */; };`);
  pbx = pbx.replace('/* Begin PBXFileReference section */', `/* Begin PBXFileReference section */\n\t\t${REF} /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; };`);
  pbx = pbx.replace(/(\t\t\t\t504EC3131FED79650016851F \/\* Info\.plist \*\/,\n)/, `$1\t\t\t\t${REF} /* PrivacyInfo.xcprivacy */,\n`);
  pbx = pbx.replace(/(isa = PBXResourcesBuildPhase;[\s\S]*?files = \(\n)/, `$1\t\t\t\t${BUILD} /* PrivacyInfo.xcprivacy in Resources */,\n`);
}

const id = (name) => crypto.createHash('md5').update(`tinytides:${name}`).digest('hex').slice(0, 24).toUpperCase();
const addFile = (buildId, refId, name, comment, refLine, phase) => {
  if (pbx.includes(`\t\t\t\t${refId} /* ${name} */,\n`)) return;     // already in the App group
  if (buildId) pbx = pbx.replace('/* Begin PBXBuildFile section */', `/* Begin PBXBuildFile section */\n\t\t${buildId} /* ${name} in ${phase} */ = {isa = PBXBuildFile; fileRef = ${refId} /* ${name} */; };`);
  if (refLine) pbx = pbx.replace('/* Begin PBXFileReference section */', `/* Begin PBXFileReference section */\n\t\t${refId} /* ${comment || name} */ = ${refLine};`);
  pbx = pbx.replace(/(\t\t\t\t504EC3131FED79650016851F \/\* Info\.plist \*\/,\n)/, `$1\t\t\t\t${refId} /* ${name} */,\n`);
  if (buildId) pbx = pbx.replace(new RegExp(`(isa = PBX${phase}BuildPhase;[\\s\\S]*?files = \\(\\n)`), `$1\t\t\t\t${buildId} /* ${name} in ${phase} */,\n`);
};

// ---------------- Declared Age Range (Apple's age signal; required where laws like Texas SB 2420 apply)
for (const f of ['AgeRangePlugin.swift', 'MainViewController.swift']) {
  if (!fs.existsSync(path.join(appDir, f))) { console.error(`missing ios/App/App/${f}`); process.exit(1); }
  addFile(id(`${f}:build`), id(f), f, '', `{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ${f}; sourceTree = "<group>"; }`, 'Sources');
}
addFile('', id('App.entitlements'), 'App.entitlements', '', '{isa = PBXFileReference; lastKnownFileType = text.plist.entitlements; path = App.entitlements; sourceTree = "<group>"; }', '');
// target build settings (the two configurations that carry INFOPLIST_FILE)
pbx = pbx.replace(/(\t\t\t\tINFOPLIST_FILE = App\/Info\.plist;\n)(?!\t\t\t\tCODE_SIGN_ENTITLEMENTS)/g, '$1\t\t\t\tCODE_SIGN_ENTITLEMENTS = App/App.entitlements;\n\t\t\t\tOTHER_LDFLAGS = (\n\t\t\t\t\t"$(inherited)",\n\t\t\t\t\t"-weak_framework",\n\t\t\t\t\tDeclaredAgeRange,\n\t\t\t\t);\n');
fs.writeFileSync(pbxPath, pbx);
const sb = path.join(appDir, 'Base.lproj/Main.storyboard');
fs.writeFileSync(sb, fs.readFileSync(sb, 'utf8').replace('customClass="CAPBridgeViewController" customModule="Capacitor"', 'customClass="MainViewController" customModule="App" customModuleProvider="target"'));
console.log('iOS project configured: Info.plist, PrivacyInfo.xcprivacy, Declared Age Range plugin');
