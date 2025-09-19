const dotenv = require('dotenv');
dotenv.config();
const express = require('express');
const app = express();
const port = process.env.PORT || 4010;
const { RpcProvider } = require('starknet');
const { MonitoringSDK } = require('@hemantwasthere/monitoring-sdk');
const PrismaClient = require('@prisma/client');
const prisma = new PrismaClient.PrismaClient();

if (!process.env.RPC_URL) {
  console.error("RPC_URL environment variable is not set.");
  process.exit(1);
}

// Initialize MonitoringSDK
const monitoring = MonitoringSDK.initialize({
  projectName: "troves",
  serviceName: "indexers",
  technology: "express",
  prefixAllMetrics: true,
  enableDefaultMetrics: true,
  environment: process.env.NODE_ENV || 'production',
  customLabels: {
    network: process.env.NETWORK || 'unknown',
    version: process.env.VERSION || 'unknown'
  }
});

const logger = monitoring.getLogger();
const metricsService = monitoring.getMetrics();

// Create custom metrics using the SDK
const indexerSyncStatus = metricsService.createGauge(
  'indexer_sync_status',
  'Status of indexer sync (1 = isActive, 0 = not active)',
  ['file']
);

const indexerCurrentBlock = metricsService.createGauge(
  'indexer_current_block',
  'Current block number for indexer',
  ['file']
);

const indexerCursorOrderKey = metricsService.createGauge(
  'indexer_cursor_order_key',
  'Current cursor order key for indexer',
  ['file']
);

const allSyncedStatus = metricsService.createGauge(
  'indexer_all_synced',
  'Whether all indexers are synced (1 = true, 0 = false)',
  []
);

const indexerBlockLag = metricsService.createGauge(
  'indexer_block_lag',
  'Number of blocks behind current block',
  ['file']
);

const indexerErrors = metricsService.createCounter(
  'indexer_errors_total',
  'Total number of indexer errors',
  ['file', 'error_type']
);

async function getMinIndexerHeadFromDB() {
  try {
    const result = await prisma.$queryRaw`
      SELECT order_key as min_order_key 
      FROM airfoil.checkpoints 
      WHERE order_key IS NOT NULL
    `;

    if (!result.length || result[0].min_order_key === null) {
      throw new Error('No valid cursor found in the checkpoints table.');
    }

    const minOrderKey = Number(result[0].min_order_key);
    logger.info(`DB::Minimum indexer head orderKey: ${minOrderKey}`);
    return minOrderKey;

  } catch (error) {
    logger.error('Error fetching min orderKey from database:', error);
    throw new Error('Failed to retrieve minimum orderKey from checkpoints table');
  }
}

// Function to get summary data and update metrics
async function getSummaryData() {
  const results = [];
  const provider = new RpcProvider({
    nodeUrl: process.env.RPC_URL
  });

  let currentBlock = 0;
  try {
    currentBlock = (await provider.getBlockLatestAccepted()).block_number;
  } catch (error) {
    throw new Error(`Error fetching latest block: ${error.message}`);
  }

  const minIndexerHead = await getMinIndexerHeadFromDB();
  const blockLag = Math.abs(currentBlock - Number(minIndexerHead));
  const isSynced = blockLag <= 10;
      
  results.push({
    file: 'indexer_head',
    status: {
      currentBlock,
      cursor: { orderKey: minIndexerHead }
    },
    isSynced: isSynced ? "isActive" : "isSyncing",
    blockLag
  });

  const isAllSynced = isSynced;

  return {
    isAllSynced,
    results,
    currentBlock
  };
}

// Function to update SDK metrics
function updateSDKMetrics(summaryData) {
  // Update all synced status
  allSyncedStatus.set({}, summaryData.isAllSynced ? 1 : 0);

  // Update individual indexer metrics
  summaryData.results.forEach(result => {
    const fileLabels = { file: result.file };

    if (result.error) {
      // Increment error counter
      indexerErrors.inc({ file: result.file, error_type: 'redis_fetch_error' });
      
      // Set sync status to 0 for errors
      indexerSyncStatus.set(fileLabels, 0);
    } else {
      const isActive = result.isSynced === 'isActive' ? 1 : 0;
      
      indexerSyncStatus.set(fileLabels, isActive);
      
      if (result.status.currentBlock) {
        indexerCurrentBlock.set(fileLabels, result.status.currentBlock);
      }
      
      if (result.status.cursor && result.status.cursor.orderKey) {
        indexerCursorOrderKey.set(fileLabels, result.status.cursor.orderKey);
      }
      
      if (result.blockLag !== undefined) {
        indexerBlockLag.set(fileLabels, result.blockLag);
      }
    }
  });
}

app.get('/summary', async (_req, res) => {
  try {
    const summaryData = await getSummaryData();
    
    // Update SDK metrics
    updateSDKMetrics(summaryData);
    
    // Log the summary
    logger.info('Indexer summary generated', { 
      isAllSynced: summaryData.isAllSynced,
      indexerCount: summaryData.results.length,
      currentBlock: summaryData.currentBlock
    });
    
    return res.status(200).json(summaryData);
  } catch (error) {
    // Increment error counter for API errors
    indexerErrors.inc({ file: 'api', error_type: 'api_error' });
    
    logger.error('Error generating summary', { error: error.message });
    
    return res.status(500).json({ error: error.message });
  }
});

app.get('/metrics', async (_req, res) => {
  try {
    // Get fresh data and update metrics
    const summaryData = await getSummaryData();
    updateSDKMetrics(summaryData);
    
    // Return SDK metrics
    res.set('Content-Type', metricsService.getRegistry().contentType);
    const metrics = await metricsService.getMetrics();
    res.send(metrics);
  } catch (error) {
    logger.error('Error generating metrics', { error: error.message });
    res.status(500).send('Error generating metrics');
  }
});

app.get('/', (_req, res) => {
  return res.status(200).json({
    status: "OK"
  });
});

// Start the Express server
app.listen(port, () => {
  logger.info(`Indexer service running on port ${port}`, { 
    port,
    network: process.env.NETWORK,
    version: process.env.VERSION
  });
});
