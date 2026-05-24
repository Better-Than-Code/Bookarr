const axios = require('axios');
async function test() {
  try {
    const res = await axios.get('https://glodls.to/search_results.php?search=harry', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    });
    console.log("Glo STATUS:", res.status);
  } catch (e) {
    console.log("Glo ERROR:", e.message);
  }
}
test();
