const epubModule = require('epub');
const EPub = epubModule.default || epubModule.EPub || epubModule;
const filePath = process.argv[2];
const epub = new EPub(filePath);
epub.on('error', function(err) {
    console.error("EPUB Parse Error:", err);
});
epub.on('end', function() {
    const flow = epub.flow || epub.spine?.contents || [];
    console.log("Flow size:", flow.length);
    if(flow.length > 0) {
        console.log("ID:", flow[0].id);
        epub.getChapter(flow[0].id, function(err, text){
            console.log("err:", err);
            console.log("text length: ", text ? text.length : 0);
        });
        
        epub.getChapterRaw(flow[0].id, function(err, text){
             console.log("Raw err:", err);
             console.log("Raw text length:", text ? text.length : 0);
        });
    } else {
        console.log("No spine items");
    }
});
epub.parse();
