import axios from 'axios';
async function test() {
  try {
    const res = await axios.get('https://glotorrents.to/search_results.php?search=harry', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    });
    console.log("Glo STATUS:", res.status);
  } catch (e) {
    console.log("Glo ERROR:", e.message);
  }

  try {
      const res = await axios.get('https://libgen.is/search.php?req=harry&column=def', { timeout: 10000 });
      console.log("Libgen STATUS:", res.status);
  } catch(e) {
      console.log("Libgen ERROR:", e.message);
  }
}
test();
