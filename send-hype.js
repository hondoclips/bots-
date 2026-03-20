const fetch = require('node-fetch');

async function run() {
  const response = await fetch('https://api.kraken.com/0/public/Ticker?pair=HYPEUSD');
  const data = await response.json();
  const price = parseFloat(data.result.HYPEUSD.c[0]);

  const ohlcResponse = await fetch('https://api.kraken.com/0/public/OHLC?pair=HYPEUSD&interval=5');
  const ohlcData = await ohlcResponse.json();
  const candles = ohlcData.result.HYPEUSD.slice(-144);
  const rawP = [];
  candles.forEach(c => { rawP.push(parseFloat(c[2])); rawP.push(parseFloat(c[3])); });
  const prices = rawP.map((_, i) => {
    const slice = rawP.slice(Math.max(0, i - 2), Math.min(rawP.length, i + 3));
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });

  const price24hAgo = parseFloat(candles[0][4]);
  const priceChange = price - price24hAgo;
  const percentChange = ((priceChange / price24hAgo) * 100).toFixed(2);
  const arrow = priceChange >= 0 ? '↗' : '↘';

  const minP = Math.min(...prices.map(p => parseFloat(p)));
  const maxP = Math.max(...prices.map(p => parseFloat(p)));
  const rangeP = maxP - minP || 0.01;
  const scaledData = prices.map(p => ((parseFloat(p) - minP) / rangeP * 100).toFixed(1));

  const chartData = scaledData.join(',');
  const lineColor = priceChange >= 0 ? '4caf50' : 'FF1919';
  const titleText = `$${price.toFixed(2)}                    |                    ${arrow} ${Math.abs(percentChange)}%`;
  const chartUrl = `https://image-charts.com/chart?cht=ls&chd=t:${chartData}&chs=998x340&chco=${lineColor}&chf=bg,s,0D0D0D&chls=3&chtt=${encodeURIComponent(titleText)}&chts=FFFFFF,31&chma=1,1,70,1`;

  const res = await fetch('https://discord.com/api/webhooks/1484347301207212184/KKSqLoP79eKWouGMQRVphUxZwMUQ96psaQAs7IiFdrwIBvXZ4SVzRWtCivh0DHpXv6bl', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [{ image: { url: chartUrl }, color: 0x0E0E0E }] })
  });
  console.log(`✅ HYPE sent: $${price.toFixed(2)} (${res.status})`);
}

run().catch(e => console.error(e));
