const fetch = require('node-fetch');

async function sendSOL() {
  try {
    const response = await fetch('https://api.kraken.com/0/public/Ticker?pair=SOLUSD');
    const data = await response.json();
    const price = parseFloat(data.result.SOLUSD.c[0]);

    const ohlcResponse = await fetch('https://api.kraken.com/0/public/OHLC?pair=SOLUSD&interval=5');
    const ohlcData = await ohlcResponse.json();
    const candles = ohlcData.result.SOLUSD.slice(-288);
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

    await fetch('https://discord.com/api/webhooks/1469437412299112662/TP1qBSLrmjEiMVRF2-yFxFHBbIJE8wH9tHQsTprTsWKDBxLm0nYixPRTFseJuUjw5Fz2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          image: { url: chartUrl },
          color: 0x0E0E0E
        }]
      })
    });

    console.log(`✅ SOL sent: $${price.toFixed(2)}`);
  } catch (error) {
    console.error(`❌ SOL failed:`, error.message);
  }
}

async function sendYahooFinance(name, ticker, webhook) {
  try {
    // Get 24h data
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=5m&range=1d`);
    const data = await response.json();

    const result = data.chart.result[0];
    const currentPrice = result.meta.regularMarketPrice;
    const highs = result.indicators.quote[0].high;
    const lows = result.indicators.quote[0].low;
    const closes = result.indicators.quote[0].close;

    // Interleave H/L then smooth with 5-point moving average
    const rawPrices = [];
    for (let i = 0; i < closes.length; i++) {
      if (highs[i] != null && lows[i] != null) {
        rawPrices.push(highs[i]);
        rawPrices.push(lows[i]);
      }
    }
    const validPrices = rawPrices.map((_, i) => {
      const slice = rawPrices.slice(Math.max(0, i - 2), Math.min(rawPrices.length, i + 3));
      return slice.reduce((a, b) => a + b, 0) / slice.length;
    });

    if (validPrices.length === 0) {
      throw new Error('No valid price data');
    }

    const price24hAgo = closes.filter(p => p != null)[0];
    const priceChange = currentPrice - price24hAgo;
    const percentChange = ((priceChange / price24hAgo) * 100).toFixed(2);
    const arrow = priceChange >= 0 ? '↗' : '↘';

    const minP = Math.min(...validPrices.map(p => parseFloat(p)));
    const maxP = Math.max(...validPrices.map(p => parseFloat(p)));
    const rangeP = maxP - minP || 0.01;
    const scaledData = validPrices.map(p => ((parseFloat(p) - minP) / rangeP * 100).toFixed(1));

    const chartData = scaledData.join(',');
    const lineColor = priceChange >= 0 ? '4caf50' : 'FF1919';
    const titleText = `$${currentPrice.toFixed(2)}                    |                    ${arrow} ${Math.abs(percentChange)}%`;
    const chartUrl = `https://image-charts.com/chart?cht=ls&chd=t:${chartData}&chs=998x340&chco=${lineColor}&chf=bg,s,0D0D0D&chls=3&chtt=${encodeURIComponent(titleText)}&chts=FFFFFF,31&chma=1,1,70,1`;

    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          image: { url: chartUrl },
          color: 0x0E0E0E
        }]
      })
    });

    console.log(`✅ ${name} sent: $${currentPrice.toFixed(2)}`);
  } catch (error) {
    console.error(`❌ ${name} failed:`, error.message);
  }
}

async function sendAll() {
  console.log('🚀 Sending all bot updates...\n');

  await sendSOL();

  await sendYahooFinance(
    'SILVER',
    'SI=F',
    'https://discord.com/api/webhooks/1469566250886631464/F8otEAu15441vJVyb8tGoPsnRtawsPq5Qdvr5Femqwg5PKSlx3bzG-16k1UqqiD5qpbs'
  );

  await sendYahooFinance(
    'COPPER',
    'HG=F',
    'https://discord.com/api/webhooks/1478085027123433523/_jpkms0FBa7W7klwYeo85ZCsrVyIHTg1Mp_FNDtiUxrlNc-_zRS89Icths_9FzvALVcQ'
  );

  console.log('\n✅ All messages sent!');
}

sendAll();
