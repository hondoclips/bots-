const fetch = require('node-fetch');

// ============ CONFIGURATION ============
const CONFIG = {
  DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1469437412299112662/TP1qBSLrmjEiMVRF2-yFxFHBbIJE8wH9tHQsTprTsWKDBxLm0nYixPRTFseJuUjw5Fz2',
  CHECK_INTERVAL: 180000, // 180 seconds (3 minutes) - slower to avoid rate limits
  PRICE_THRESHOLD: 5, // Alert every $5
  STATUS_UPDATE_INTERVAL: 6 * 60 * 60 * 1000, // 6 hours
  COIN_ID: 'solana',
};

// ============ STATE ============
let lastLevel = null;
let lastPrice = null;
let lastStatusUpdate = null;
let consecutiveFailures = 0;
let lastErrorAlert = null;

// ============ FUNCTIONS ============

async function getSOLPrice() {
  try {
    // Using Kraken API (free, no API key required, US-friendly)
    const response = await fetch(
      'https://api.kraken.com/0/public/Ticker?pair=SOLUSD'
    );

    if (!response.ok) {
      throw new Error(`Kraken API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.error && data.error.length > 0) {
      throw new Error(`Kraken API error: ${data.error.join(', ')}`);
    }

    consecutiveFailures = 0; // Reset on success
    const price = parseFloat(data.result.SOLUSD.c[0]);
    return price;
  } catch (error) {
    console.error('Error fetching price:', error.message);
    consecutiveFailures++;

    // Alert after 5 consecutive failures (15 minutes)
    if (consecutiveFailures >= 5) {
      await sendErrorAlert('Price Fetch Failed', `Failed to fetch SOL price ${consecutiveFailures} times in a row. Kraken API may be down.`);
    }

    return null;
  }
}

async function sendErrorAlert(errorType, errorMessage) {
  // Prevent spamming - only send error alerts every 30 minutes
  const now = Date.now();
  if (lastErrorAlert && (now - lastErrorAlert) < 30 * 60 * 1000) {
    console.log('⚠️  Skipping error alert (cooldown active)');
    return;
  }

  const message = {
    embeds: [{
      description: `🚨 **SOL Bot Error**\n\n${errorMessage}`,
      color: 0xff0000,
      timestamp: new Date().toISOString()
    }]
  };

  try {
    const response = await fetch(CONFIG.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });

    if (response.ok) {
      lastErrorAlert = now;
      console.log(`🚨 Error alert sent: ${errorType}`);
    }
  } catch (error) {
    console.error('Failed to send error alert:', error.message);
  }
}

async function sendDiscordAlert(price, level, direction) {
  const arrow = direction === 'up' ? '↗' : '↘';
  const nextLevel = direction === 'up' ? level : level + CONFIG.PRICE_THRESHOLD;
  const directionText = direction === 'up' ? `crossed above $${nextLevel}` : `fell below $${nextLevel}`;

  // Calculate change from previous price
  const priceChange = lastPrice ? price - lastPrice : 0;
  const percentChange = lastPrice ? ((price - lastPrice) / lastPrice) * 100 : 0;
  const changeSign = priceChange >= 0 ? '+' : '';
  const changeText = lastPrice
    ? `${arrow} $${Math.abs(priceChange).toFixed(2)} (${changeSign}${percentChange.toFixed(2)}%)`
    : 'N/A';

  // Generate chart matching the reference image style
  const lineColor = direction === 'up' ? 'rgb(76,175,80)' : 'rgb(244,106,106)';
  const startPrice = lastPrice || price;

  // Create 12-hour realistic price movement
  const dataPoints = [];
  const numPoints = 13; // 12 hours + current
  let simPrice = startPrice;
  for (let i = 0; i < numPoints - 1; i++) {
    simPrice += (Math.random() - 0.48) * Math.abs(price - startPrice) * 0.15;
    dataPoints.push(Number(simPrice).toFixed(2));
  }
  dataPoints.push(Number(price).toFixed(2));

  const chartConfig = {
    type: 'line',
    data: {
      datasets: [{
        data: dataPoints,
        borderColor: lineColor,
        borderWidth: 2,
        fill: false,
        pointRadius: 0,
        tension: 0.3
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { display: false },
        y: { display: false }
      },
      layout: { padding: 0 }
    }
  };

  // Use simulated data for chart
  const lineColorHex = direction === 'up' ? '4caf50' : 'f46a6a';
  const chartData = dataPoints.join(',');
  const chartUrl = `https://image-charts.com/chart?cht=ls&chd=a:${chartData}&chs=700x180&chco=${lineColorHex}&chxt=&chf=bg,s,000000&chls=2.5&chm=`;

  /*
  try {
    const ohlcResponse = await fetch('https://api.kraken.com/0/public/OHLC?pair=SOLUSD&interval=5');
    const ohlcData = await ohlcResponse.json();

    if (ohlcData.result && ohlcData.result.SOLUSD) {
      const candles = ohlcData.result.SOLUSD.slice(-60);
      const prices = [];
      candles.forEach(c => {
        prices.push(parseFloat(c[2]).toFixed(2));
        prices.push(parseFloat(c[3]).toFixed(2));
      });

      const lineColorHex = direction === 'up' ? '4caf50' : 'f46a6a';
      const chartData = prices.join(',');
      chartUrl = \`https://image-charts.com/chart?cht=ls&chd=a:\${chartData}&chs=700x180&chco=\${lineColorHex}&chxt=&chf=bg,s,000000&chls=2.5&chm=\`;
    } else {
      chartUrl = \`https://quickchart.io/chart?backgroundColor=rgb(0,0,0)&c=\${encodeURIComponent(JSON.stringify(chartConfig))}&w=700&h=180\`;
    }
  } catch (err) {
    chartUrl = \`https://quickchart.io/chart?backgroundColor=rgb(0,0,0)&c=\${encodeURIComponent(JSON.stringify(chartConfig))}&w=700&h=180\`;
  }
  */
  const message = {
    embeds: [{
      description: `**$${price.toFixed(2)}**`,
      image: { url: chartUrl }
    }]
  };

  try {
    const response = await fetch(CONFIG.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      throw new Error(`Discord webhook error: ${response.status}`);
    }

    console.log(`✅ Alert sent: SOL ${directionText} (current: $${price.toFixed(2)})`);
  } catch (error) {
    console.error('Error sending Discord message:', error.message);
  }
}

async function sendStatusUpdate(price) {
  try {
    // Fetch 24 hours of OHLC data (5-minute intervals for more detail)
    const ohlcResponse = await fetch('https://api.kraken.com/0/public/OHLC?pair=SOLUSD&interval=5');
    const ohlcData = await ohlcResponse.json();

    const candles = ohlcData.result.SOLUSD.slice(-288); // Last 288 5-min candles = 24h

    // Interleave high and low of each candle for more up/down movement
    const prices = [];
    candles.forEach(c => {
      prices.push(parseFloat(c[2])); // high
      prices.push(parseFloat(c[3])); // low
    });

    // Calculate 24h change using first and last close
    const price24hAgo = parseFloat(candles[0][4]);
    const priceChange = price - price24hAgo;
    const percentChange = ((priceChange / price24hAgo) * 100).toFixed(2);
    const arrow = priceChange >= 0 ? '↗' : '↘';

    // Normalize to 0-100 range so chart fills the area
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const range = maxPrice - minPrice || 0.01;
    const scaledData = prices.map(p => ((p - minPrice) / range * 100).toFixed(1));

    const chartData = scaledData.join(',');
    const lineColor = priceChange >= 0 ? '4caf50' : 'FF1919';

    const titleText = `$${price.toFixed(2)}                    |                    ${arrow} ${Math.abs(percentChange)}%`;
    const chartUrl = `https://image-charts.com/chart?cht=ls&chd=t:${chartData}&chs=998x340&chco=${lineColor}&chf=bg,s,0D0D0D&chls=3&chtt=${encodeURIComponent(titleText)}&chts=FFFFFF,31&chma=1,1,70,1`;

    const message = {
      embeds: [{
        image: { url: chartUrl },
        color: 0x0E0E0E
      }]
    };

    const response = await fetch(CONFIG.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      throw new Error(`Discord webhook error: ${response.status}`);
    }

    console.log(`📊 Status update sent: SOL $${price.toFixed(2)} (${arrow} ${Math.abs(percentChange)}%)`);
  } catch (error) {
    console.error('Error sending status update:', error.message);
  }
}

async function checkPrice() {
  const price = await getSOLPrice();

  if (price === null) {
    console.log('⚠️  Failed to fetch price, will retry next interval');
    return;
  }

  const currentLevel = Math.floor(price / CONFIG.PRICE_THRESHOLD) * CONFIG.PRICE_THRESHOLD;

  console.log(`🔍 SOL: $${price.toFixed(2)} (level: $${currentLevel})`);

  // First run - just store the initial level
  if (lastLevel === null) {
    lastLevel = currentLevel;
    lastPrice = price;
    console.log(`📊 Initial level set: $${currentLevel}`);
    return;
  }

  // Check if we crossed a level
  if (currentLevel !== lastLevel) {
    const direction = currentLevel > lastLevel ? 'up' : 'down';
    await sendDiscordAlert(price, currentLevel, direction);
    lastLevel = currentLevel;
  }

  lastPrice = price;
}

function getNextMountainUpdate() {
  const now = new Date();
  const next = new Date(now);

  // Mountain Time = UTC-7, so 12 PM MT = 19:00 UTC, 12 AM MT = 07:00 UTC
  const currentUTCHour = now.getUTCHours();

  // MST (UTC-7): 6PM=01:00, 12AM=07:00, 6AM=13:00, 12PM=19:00
  const updateHours = [1, 7, 13, 19];
  for (const hour of updateHours) {
    if (currentUTCHour < hour) {
      next.setUTCHours(hour, 0, 0, 0);
      return next;
    }
  }
  // Next is 1 AM UTC tomorrow (6 PM MT)
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(1, 0, 0, 0);

  return next;
}

async function start() {
  console.log('🚀 SOL Price Bot Starting...');
  console.log(`📊 Status updates: 6PM, 12AM, 6AM, 12PM Mountain Time`);
  console.log('─'.repeat(50));

  // Validate webhook URL
  if (CONFIG.DISCORD_WEBHOOK_URL === 'YOUR_DISCORD_WEBHOOK_URL_HERE') {
    console.error('❌ ERROR: Please set your Discord webhook URL in the CONFIG section');
    process.exit(1);
  }

  const nextUpdate = getNextMountainUpdate();
  const msUntilNext = nextUpdate - new Date();

  console.log(`📅 Next status update: ${nextUpdate.toUTCString()}`);

  setTimeout(async () => {
    const price = await getSOLPrice();
    if (price) {
      await sendStatusUpdate(price);
    }

    // Repeat every 6 hours
    setInterval(async () => {
      const price = await getSOLPrice();
      if (price) {
        await sendStatusUpdate(price);
      }
    }, 6 * 60 * 60 * 1000);
  }, msUntilNext);

  console.log('✅ Bot running!');
}

// ============ START BOT ============
start();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down bot...');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('💥 Uncaught Exception:', error);
  await sendErrorAlert('Uncaught Exception', `Bot crashed: ${error.message}\n\nStack: ${error.stack?.slice(0, 200)}`);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async (reason, promise) => {
  console.error('💥 Unhandled Rejection:', reason);
  await sendErrorAlert('Unhandled Promise Rejection', `Promise rejected: ${reason}`);
});
