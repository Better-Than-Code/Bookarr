import WebTorrent from 'webtorrent';
const client = new WebTorrent();
console.log('Starting torrent...');
const magnetURI = 'magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.fastcast.nz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com';

client.add(magnetURI, { path: './' }, (torrent) => {
  console.log('Metadata ready!');
  console.log('Files:', torrent.files.map((f) => f.name));
  
  torrent.on('download', (bytes) => {
    console.log('Speed:', torrent.downloadSpeed);
  });

  torrent.on('wire', (wire, addr) => {
      console.log('Connected to peer:', addr);
  });
});
setTimeout(() => {
    console.log('Timeout. Torrents:', client.torrents.length);
    client.torrents.forEach((t) => console.log(t.numPeers, t.infoHash, t.ready));
    process.exit(0);
}, 10000);
