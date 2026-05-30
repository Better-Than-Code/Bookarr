import axios from 'axios';
axios.get('http://127.0.0.1:3000/api/models/diffusionstudio/piper-voices/resolve/main/en/en_US/libritts/high/en_US-libritts-high.onnx', { responseType: 'stream' })
  .then(r => {
      console.log('Success:', r.status);
      r.data.on('data', chunk => console.log('got data chunk', chunk.length));
  })
  .catch(e => console.log('Error:', e.response?.status, e.message));
