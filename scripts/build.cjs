const fs = require("node:fs");
const { stripTypeScriptTypes } = require("node:module");
const exportsByModule = {"earnings-core": ["EarningsCore", "createEngine, parseAmount, parseDate, projectDate, seedHistory"], "research-houses": ["ResearchHouses", "createRegistry, saveHouse, resolveHouse, applyRegistry, mergeRegistry"]};
for (const name of Object.keys(exportsByModule)) {
  const source = fs.readFileSync("src/" + name + ".ts", "utf8");
  const js = stripTypeScriptTypes(source, { mode: "strip" }).replace(
    /^export /gm,
    "",
  ).replace(/[ \t]+$/gm, "");
  fs.writeFileSync(
    "assets/" + name + ".js",
    "/* Generated from src/" +
      name +
      ".ts. Run npm run build. */\n(()=>{\n" +
      js +
      "\nglobalThis." + exportsByModule[name][0] + " = {" + exportsByModule[name][1] + "};\n})();\n",
  );
}
