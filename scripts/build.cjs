const fs = require("node:fs");
const { stripTypeScriptTypes } = require("node:module");
for (const name of ["earnings-core"]) {
  const source = fs.readFileSync("src/" + name + ".ts", "utf8");
  const js = stripTypeScriptTypes(source, { mode: "strip" }).replace(
    /^export /gm,
    "",
  );
  fs.writeFileSync(
    "assets/" + name + ".js",
    "/* Generated from src/" +
      name +
      ".ts. Run npm run build. */\n(()=>{\n" +
      js +
      "\nglobalThis.EarningsCore = {createEngine, parseAmount, parseDate, projectDate, seedHistory};\n})();\n",
  );
}
