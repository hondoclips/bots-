const fetch = require('node-fetch');

// ============ CONFIGURATION ============
const CONFIG = {
  DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1478085027123433523/_jpkms0FBa7W7klwYeo85ZCsrVyIHTg1Mp_FNDtiUxrlNc-_zRS89Icths_9FzvALVcQ',
  CHECK_INTERVAL: 600000, // 600 seconds (10 minutes)
  PRICE_THRESHOLD: 0.50, // Alert every $0.50
  STATUS_UPDATE_INTERVAL: 12 * 60 * 60 * 1000, // 12 hours
};

// ============ STATE ============
let lastLevel = null;
let lastPrice = null;
let lastStatusUpdate = null;
let consecutiveFailures = 0;
let lastErrorAlert = null;

// ============ FUNCTIONS ============

async function getCopperPrice() {
  try {
    // Using Yahoo Finance for real Copper Futures prices (HG=F)
    const response = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/HG=F?interval=1d&range=1d'
    );

    if (!response.ok) {
      throw new Error(`Yahoo Finance API error: ${response.status}`);
    }

    const data = await response.json();
    consecutiveFailures = 0; // Reset on success

    // Copper futures price per troy ounce in USD
    const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
    return price || null;
  } catch (error) {
    console.error('Error fetching price:', error.message);
    consecutiveFailures++;

    // Alert after 5 consecutive failures (50 minutes)
    if (consecutiveFailures >= 5) {
      await sendErrorAlert('Price Fetch Failed', `Failed to fetch Copper price ${consecutiveFailures} times in a row. API may be down.`);
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
      description: `🚨 **Copper Bot Error**\n\n${errorMessage}`,
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

  const lineColorHex = direction === 'up' ? '4caf50' : 'f46a6a';
  const chartData = dataPoints.join(',');
  const chartUrl = `https://image-charts.com/chart?cht=ls&chd=a:${chartData}&chs=700x180&chco=${lineColorHex}&chxt=&chf=bg,s,000000&chls=2.5&chm=`;

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

    console.log(`✅ Alert sent: Copper ${directionText} (current: $${price.toFixed(2)})`);
  } catch (error) {
    console.error('Error sending Discord message:', error.message);
  }
}

async function sendStatusUpdate(price) {
  try {
    // Fetch 24 hours of real silver price data (5-minute intervals)
    const response = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/HG=F?interval=5m&range=12h');
    const data = await response.json();

    const highs = data.chart?.result?.[0]?.indicators?.quote?.[0]?.high || [];
    const lows = data.chart?.result?.[0]?.indicators?.quote?.[0]?.low || [];
    const closes = data.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];

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

    const currentPrice = closes.filter(p => p !== null).slice(-1)[0] || price;
    const price24hAgo = closes.filter(p => p !== null)[0] || currentPrice;
    const priceChange = currentPrice - price24hAgo;
    const percentChange = ((priceChange / price24hAgo) * 100).toFixed(2);
    const arrow = priceChange >= 0 ? '↗' : '↘';

    // Normalize to 0-100 range so chart fills the area
    const minPrice = Math.min(...validPrices);
    const maxPrice = Math.max(...validPrices);
    const range = maxPrice - minPrice || 0.01;
    const scaledData = validPrices.map(p => ((p - minPrice) / range * 100).toFixed(1));

    const chartData = scaledData.join(',');
    const lineColor = priceChange >= 0 ? '4caf50' : 'FF1919';

    const titleText = `$${currentPrice.toFixed(4)}                    |                    ${arrow} ${Math.abs(percentChange)}%`;
    const chartUrl = `https://image-charts.com/chart?cht=ls&chd=t:${chartData}&chs=998x340&chco=${lineColor}&chf=bg,s,0D0D0D&chls=3&chtt=${encodeURIComponent(titleText)}&chts=FFFFFF,31&chma=1,1,70,1`;

    const message = {
      embeds: [{
        image: { url: chartUrl },
        color: 0x0E0E0E
      }]
    };

    const discordResponse = await fetch(CONFIG.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });

    if (!discordResponse.ok) {
      throw new Error(`Discord webhook error: ${discordResponse.status}`);
    }

    console.log(`📊 Status update sent: Copper $${currentPrice.toFixed(2)} (${arrow} ${Math.abs(percentChange)}%)`);
  } catch (error) {
    console.error('Error sending status update:', error.message);
  }
}

async function checkPrice() {
  const price = await getCopperPrice();

  if (price === null) {
    console.log('⚠️  Failed to fetch price, will retry next interval');
    return;
  }

  const currentLevel = Math.floor(price / CONFIG.PRICE_THRESHOLD) * CONFIG.PRICE_THRESHOLD;

  console.log(`🔍 Copper: $${price.toFixed(2)} (level: $${currentLevel})`);

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
  console.log('🚀 Copper Price Bot Starting...');
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
    const price = await getCopperPrice();
    if (price) {
      await sendStatusUpdate(price);
    }

    // Repeat every 6 hours
    setInterval(async () => {
      const price = await getCopperPrice();
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
