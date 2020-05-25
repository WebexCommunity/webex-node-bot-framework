#!/bin/bash

JSDOC="$(pwd)/../node_modules/jsdoc-to-markdown/bin/cli.js"
DOCTOC="$(pwd)/../node_modules/doctoc/doctoc.js"
README="$(pwd)/../README.md"

cat header.md > ${README}
cat installation.md >> ${README}
cat example1.md >> ${README}
cat overview.md >> ${README}

echo -e "\n# Framework Reference\n\n" >> ${README}

${JSDOC} ../lib/framework.js ../lib/bot.js >> ${README}

echo -e "\n# Storage Driver Reference\n\n" >> ${README}

${JSDOC} ../storage/mongo.js >> ${README}

cat license.md >> ${README}

${DOCTOC} --github --notitle --maxlevel 2 ${README}

