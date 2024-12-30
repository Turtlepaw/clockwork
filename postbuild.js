// filepath: /e:/wff-build-script/scripts/replace-version.js
const fs = require("fs");
const path = require("path");

const packageJson = require("./package.json");
const version = packageJson.version;

console.log(`Injecting version: ${version}`);

const filePath = path.join(__dirname, "build", "index.js");
const fileContent = fs.readFileSync(filePath, "utf8");

const updatedContent = fileContent.replace(/__VERSION__/g, version);

fs.writeFileSync(filePath, updatedContent, "utf8");
