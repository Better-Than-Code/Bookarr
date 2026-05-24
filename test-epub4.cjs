const epubModule = require('epub');
const EPub = epubModule.default || epubModule.EPub || epubModule;
const filePath = process.argv[2];
const epub = new EPub(filePath);
console.log("instanceof EventEmitter:", epub instanceof require('events').EventEmitter);
console.log("has on?", typeof epub.on);
