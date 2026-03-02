const fetch = require('node-fetch');

async function run() {
  const response = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/HG=F?interval=5m&range=1d');
  const data = await response.json();
  const result = data.chart.result[0];
  const currentPrice = result.meta.regularMarketPrice;
  const quotes = result.indicators.quote[0].close;
  const validPrices = quotes.filter(p => p !== null);
  const price24hAgo = validPrices[0];
  const priceChange = currentPrice - price24hAgo;
  const percentChange = ((priceChange / price24hAgo) * 100).toFixed(2);
  const arrow = priceChange >= 0 ? '↗' : '↘';
  const minP = Math.min(...validPrices);
  const maxP = Math.max(...validPrices);
  const rangeP = maxP - minP || 0.01;
  const scaledData = validPrices.map(p => ((p - minP) / rangeP * 100).toFixed(1)).join(',');
  const lineColor = priceChange >= 0 ? '4caf50' : 'FF1919';
  const titleText = `$${currentPrice.toFixed(4)}                    |                    ${arrow} ${Math.abs(percentChange)}%`;
  const chartUrl = `https://image-charts.com/chart?cht=ls&chd=t:${scaledData}&chs=998x340&chco=${lineColor}&chf=bg,s,0D0D0D&chls=3&chtt=${encodeURIComponent(titleText)}&chts=FFFFFF,31&chma=1,1,70,1`;
  const res = await fetch('https://discord.com/api/webhooks/1478085027123433523/_jpkms0FBa7W7klwYeo85ZCsrVyIHTg1Mp_FNDtiUxrlNc-_zRS89Icths_9FzvALVcQ', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [{ image: { url: chartUrl }, color: 0x0E0E0E }] })
  });
  console.log(`✅ Copper sent: $${currentPrice.toFixed(4)} (${res.status})`);
}

run().catch(e => console.error(e));
