import axios from 'axios';
axios.head('https://huggingface.co/diffusionstudio/piper-voices/resolve/main/en/en_US/libritts/high/en_US-libritts-high.onnx')
  .then(r => console.log(r.status))
  .catch(e => console.log(e.response?.status));
