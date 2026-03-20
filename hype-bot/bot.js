const fetch = require('node-fetch');

// ============ CONFIGURATION ============
const CONFIG = {
  DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1484347301207212184/KKSqLoP79eKWouGMQRVphUxZwMUQ96psaQAs7IiFdrwIBvXZ4SVzRWtCivh0DHpXv6bl',
};

// ============ FUNCTIONS ============

async function getHYPEPrice() {
  try {
    const response = await fetch('https://api.kraken.com/0/public/Ticker?pair=HYPEUSD');
    if (!response.ok) throw new Error(`Kraken API error: ${response.status}`);
    const data = await response.json();
    if (data.error && data.error.length > 0) throw new Error(`Kraken API error: ${data.error.join(', ')}`);
    return parseFloat(data.result.HYPEUSD.c[0]);
  } catch (error) {
    console.error('Error fetching HYPE price:', error.message);
    return null;
  }
}

async function sendStatusUpdate(price) {
  try {
    const ohlcResponse = await fetch('https://api.kraken.com/0/public/OHLC?pair=HYPEUSD&interval=5');
    const ohlcData = await ohlcResponse.json();
    const candles = ohlcData.result.HYPEUSD.slice(-144);

    const rawPrices = [];
    candles.forEach(c => {
      rawPrices.push(parseFloat(c[2])); // high
      rawPrices.push(parseFloat(c[3])); // low
    });
    const prices = rawPrices.map((_, i) => {
      const slice = rawPrices.slice(Math.max(0, i - 2), Math.min(rawPrices.length, i + 3));
      return slice.reduce((a, b) => a + b, 0) / slice.length;
    });

    const price24hAgo = parseFloat(candles[0][4]);
    const priceChange = price - price24hAgo;
    const percentChange = ((priceChange / price24hAgo) * 100).toFixed(2);
    const arrow = priceChange >= 0 ? '↗' : '↘';

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const range = maxPrice - minPrice || 0.01;
    const scaledData = prices.map(p => ((p - minPrice) / range * 100).toFixed(1));

    const chartData = scaledData.join(',');
    const lineColor = priceChange >= 0 ? '4caf50' : 'FF1919';
    const titleText = `$${price.toFixed(2)}                    |                    ${arrow} ${Math.abs(percentChange)}%`;
    const chartUrl = `https://image-charts.com/chart?cht=ls&chd=t:${chartData}&chs=998x340&chco=${lineColor}&chf=bg,s,0D0D0D&chls=3&chtt=${encodeURIComponent(titleText)}&chts=FFFFFF,31&chma=1,1,70,1`;

    const response = await fetch(CONFIG.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [{ image: { url: chartUrl }, color: 0x0E0E0E }] })
    });

    if (!response.ok) throw new Error(`Discord webhook error: ${response.status}`);
    console.log(`📊 HYPE status update sent: $${price.toFixed(2)} (${arrow} ${Math.abs(percentChange)}%)`);
  } catch (error) {
    console.error('Error sending status update:', error.message);
  }
}

function getMountainTime() {
  const now = new Date();
  const year = now.getUTCFullYear();

  let marchSundays = 0, dstStart = null;
  for (let d = 1; d <= 31; d++) {
    if (new Date(Date.UTC(year, 2, d)).getUTCDay() === 0) {
      marchSundays++;
      if (marchSundays === 2) { dstStart = new Date(Date.UTC(year, 2, d, 9)); break; }
    }
  }
  let novStart = null;
  for (let d = 1; d <= 30; d++) {
    if (new Date(Date.UTC(year, 10, d)).getUTCDay() === 0) {
      novStart = new Date(Date.UTC(year, 10, d, 8)); break;
    }
  }

  const offset = (now >= dstStart && now < novStart) ? -6 : -7;
  const mt = new Date(now.getTime() + offset * 3600000);
  return { hour: mt.getUTCHours(), minute: mt.getUTCMinutes() };
}

async function start() {
  console.log('🚀 HYPE Price Bot Starting...');
  console.log('📊 Status updates: 6PM, 12AM, 6AM, 12PM Mountain Time');
  console.log('─'.repeat(50));

  const UPDATE_HOURS = new Set([0, 6, 12, 18]);
  let lastSentHour = -1;

  setInterval(async () => {
    const { hour, minute } = getMountainTime();

    if (UPDATE_HOURS.has(hour) && minute < 2 && lastSentHour !== hour) {
      lastSentHour = hour;
      console.log(`📊 Sending scheduled update (${hour}:00 Mountain)`);
      const price = await getHYPEPrice();
      if (price) await sendStatusUpdate(price);
    }
  }, 60 * 1000);

  console.log('✅ Bot running! Checks every minute for scheduled updates.');
}

start();

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down HYPE bot...');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('💥 Unhandled Rejection:', reason);
});
