function runBasicTests() {
  console.log('🧪 YouTube Assistant - Basic Tests');
  console.log('');

  let passed = 0;
  let failed = 0;

  // Test 1: Check if classes exist
  try {
    if (typeof AnalyticsEngine !== 'undefined' && typeof YouTubeApiManager !== 'undefined') {
      console.log('✅ Core classes found');
      passed++;
    } else {
      console.log('❌ Core classes missing');
      failed++;
    }
  } catch (error) {
    console.log('❌ Class check failed:', error.message);
    failed++;
  }

  // Test 2: Analytics Engine basic functionality
  try {
    const analytics = new AnalyticsEngine();
    const engagementRate = analytics.calculateEngagementRate(1000, 50, 10);
    
    if (typeof engagementRate === 'number' && engagementRate === 6) {
      console.log('✅ Analytics calculation works');
      passed++;
    } else {
      console.log('❌ Analytics calculation failed');
      failed++;
    }
  } catch (error) {
    console.log('❌ Analytics test failed:', error.message);
    failed++;
  }

  // Test 3: API Manager initialization
  try {
    const apiManager = new YouTubeApiManager();
    if (apiManager.maxRetries === 3) {
      console.log('✅ API Manager initialized');
      passed++;
    } else {
      console.log('❌ API Manager initialization failed');
      failed++;
    }
  } catch (error) {
    console.log('❌ API Manager test failed:', error.message);
    failed++;
  }

  // Test 4: Utility functions
  try {
    const formatted = formatNumber(12345);
    const date = formatDate('2024-01-01T12:00:00Z');
    
    if (typeof formatted === 'string' && typeof date === 'string') {
      console.log('✅ Utility functions work');
      passed++;
    } else {
      console.log('❌ Utility functions failed');
      failed++;
    }
  } catch (error) {
    console.log('❌ Utility test failed:', error.message);
    failed++;
  }

  console.log('');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('🎉 All basic tests passed!');
    return true;
  } else {
    console.log('⚠️ Some tests failed');
    return false;
  }
}

function smokeTest() {
  console.log('💨 Running smoke test...');

  try {
    // Test core classes exist
    if (typeof AnalyticsEngine === 'undefined') {
      console.log('❌ AnalyticsEngine class not found');
      return false;
    }

    if (typeof YouTubeApiManager === 'undefined') {
      console.log('❌ YouTubeApiManager class not found');
      return false;
    }

    // Test basic functionality
    const analytics = new AnalyticsEngine();
    const apiManager = new YouTubeApiManager();

    // Test basic analytics calculation
    const engagementRate = analytics.calculateEngagementRate(1000, 50, 10);
    if (typeof engagementRate !== 'number' || engagementRate < 0) {
      console.log('❌ Analytics engagement calculation failed');
      return false;
    }

    console.log('✅ Smoke test passed - core functionality is working');
    return true;

  } catch (error) {
    console.log(`❌ Smoke test failed: ${error.message}`);
    return false;
  }
}

// Performance test with sample data
function performanceTest() {
  console.log('⚡ Running performance test...');

  try {
    const analytics = new AnalyticsEngine();
    const startTime = Date.now();

    // Generate test data
    const testData = [];
    for (let i = 0; i < 50; i++) {
      testData.push({
        viewCount: Math.floor(Math.random() * 100000),
        likeCount: Math.floor(Math.random() * 5000),
        commentCount: Math.floor(Math.random() * 1000),
        publishedAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
        category: 'Education',
        durationSeconds: Math.floor(Math.random() * 600) + 30
      });
    }

    // Run analytics operations
    const trending = analytics.identifyTrendingContent(testData);
    const patterns = analytics.analyzeUploadPatterns(testData);

    const endTime = Date.now();
    const processingTime = endTime - startTime;

    console.log(`✅ Performance test completed:`);
    console.log(`   Processed: 50 videos`);
    console.log(`   Time: ${processingTime}ms`);
    console.log(`   Trending found: ${trending.length}`);
    console.log(`   Best upload day: ${patterns.bestUploadDay}`);

    return processingTime < 3000; // Should complete within 3 seconds

  } catch (error) {
    console.log(`❌ Performance test failed: ${error.message}`);
    return false;
  }
}

// Create test menu for Google Apps Script
function createTestMenu() {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu('🧪 Tests')
      .addItem('🚀 Run Basic Tests', 'runBasicTests')
      .addItem('💨 Smoke Test', 'smokeTest')
      .addItem('⚡ Performance Test', 'performanceTest')
      .addToUi();

    console.log('✅ Test menu created');
  } catch (error) {
    console.log(`⚠️ Could not create test menu: ${error.message}`);
  }
}

// Auto-setup when script loads
function onOpen() {
  createTestMenu();
}