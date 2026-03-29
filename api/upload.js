/**
 * Vercel Serverless Function
 * Handles traffic plan image generation and AppSheet upload
 * Bypasses CORS by running server-side
 */

const https = require('https');

// AppSheet Configuration
const APPSHEET_APP_ID = 'e7f17c0c-6128-4a5f-9b6a-70253a7dd589';
const APPSHEET_API_KEY = 'V2-44bjM-Ui29x-AvGpc-iyfWi-GM9lo-RYzlP-luXHS-kDLZQ';
const APPSHEET_TABLE = 'Form Data';

/**
 * Main handler function
 */
module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { planImageBase64, planInfo, placedSigns } = req.body;

    if (!planImageBase64) {
      return res.status(400).json({ success: false, error: 'No image data provided' });
    }

    console.log('Received traffic plan data');
    console.log('Image size:', planImageBase64.length, 'characters');
    console.log('Plan info:', planInfo);
    console.log('Placed signs:', placedSigns ? placedSigns.length : 0);

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `TrafficPlan_${timestamp}.png`;

    // Prepare AppSheet row data
    const rowData = {
      "Date?": new Date().toISOString().split('T')[0],
      "Time?": new Date().toTimeString().split(' ')[0],
      "Typical Layout Used": planInfo?.layoutTitle || 'Custom',
      "Modified?": "Yes",
      "Layout Modification": {
        "FileName": filename,
        "FileExtension": "png",
        "FileData": planImageBase64
      }
    };

    // Add optional fields
    if (planInfo?.roadType) {
      rowData["Road Type?"] = planInfo.roadType;
    }
    if (planInfo?.roadComponent) {
      rowData["Road Component?"] = planInfo.roadComponent;
    }

    console.log('Uploading to AppSheet...');

    // Upload to AppSheet
    const result = await uploadToAppSheet(rowData);

    console.log('AppSheet result:', result);

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: 'Traffic plan uploaded successfully to AppSheet'
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error || 'AppSheet upload failed'
      });
    }

  } catch (error) {
    console.error('Error processing request:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
};

/**
 * Upload to AppSheet API
 */
async function uploadToAppSheet(rowData) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      "Action": "Add",
      "Properties": {},
      "Rows": [rowData]
    });

    const options = {
      hostname: 'api.appsheet.com',
      port: 443,
      path: `/api/v2/apps/${APPSHEET_APP_ID}/tables/${encodeURIComponent(APPSHEET_TABLE)}/Action`,
      method: 'POST',
      headers: {
        'ApplicationAccessKey': APPSHEET_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log('AppSheet response status:', res.statusCode);
        console.log('AppSheet response:', data);

        if (res.statusCode === 200) {
          try {
            const response = JSON.parse(data);
            resolve({
              success: true,
              appsheetResponse: response
            });
          } catch (e) {
            resolve({
              success: true,
              appsheetResponse: data
            });
          }
        } else {
          resolve({
            success: false,
            error: `AppSheet returned status ${res.statusCode}`,
            details: data
          });
        }
      });
    });

    req.on('error', (error) => {
      console.error('AppSheet request error:', error);
      resolve({
        success: false,
        error: error.message
      });
    });

    req.write(payload);
    req.end();
  });
}
