const fs = require('fs');
const css = fs.readFileSync('styles.css', 'utf8');
const formatted = css.replace(/}/g, "}\n").replace(/{/g, " {\n  ").replace(/;/g, ";\n  ");
fs.writeFileSync('styles.css', formatted);
