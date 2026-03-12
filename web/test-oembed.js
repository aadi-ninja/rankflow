async function testOEmbed() {
  const tiktokUrl = "https://www.tiktok.com/@tiktok/video/7106594312292453675";
  const igUrl = "https://www.instagram.com/p/CzwiDc9vweO/";

  try {
    const ttRes = await fetch(`https://www.tiktok.com/oembed?url=${tiktokUrl}`);
    const ttJson = await ttRes.json();
    console.log("TikTok Thumbnail:", ttJson.thumbnail_url);

    const igRes = await fetch(`https://api.instagram.com/oembed/?url=${igUrl}`);
    const igJson = await igRes.json();
    console.log("Instagram Thumbnail:", igJson.thumbnail_url);
  } catch (e) {
    console.error(e);
  }
}

testOEmbed();
