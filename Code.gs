// ===================
// GLOBAL CONFIGURATION
// ===================
// IMPORTANT: Replace 'YOUR_SPREADSHEET_ID_HERE' with your actual Google Spreadsheet ID.
const SPREADSHEET_ID = '1dsg6cn961vYL9US8q89irGsqnP1Gxd5wqiM3lDM7gY8'; // Ensure this is your actual ID
const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

const SHEETS = {
  EMPLOYEES: 'Employees',
  SETTINGS: 'Company_Settings',
  LOGS: 'System_Logs',
  ATTENDANCE: 'Attendance',
  LEAVES: 'Leaves',
  TASKS: 'Tasks',
  TASK_SUBMISSIONS: 'Task_Submissions',
  PERFORMANCE: 'Performance',
  DEPARTMENTS: 'Departments',
  NOTIFICATIONS: 'Notifications',
  PAYROLL: 'Payroll',
  POLICIES: 'Policies',
  LEAVE_TYPES: 'Leave_Types', // New Sheet
  HOLIDAYS: 'Holidays',       // New Sheet
  ANNOUNCEMENTS: 'Announcements' // New Sheet
};

// **ENHANCED EMPLOYEE_COLS MAPPING**
// Ensure these indices match your actual spreadsheet columns
const EMPLOYEE_COLS = {
  ID: 0, USERNAME: 1, PWHASH: 2, SALT: 3, FIRSTNAME: 4, LASTNAME: 5, PHOTOURL: 6,
  EMAIL: 7, PHONE: 8, ADDRESS: 9, DEPARTMENT: 10, ROLE: 11, STATUS: 12, JOINING_DATE: 13,
  EMERGENCY_CONTACT_NAME: 14, EMERGENCY_CONTACT_PHONE: 15, EMERGENCY_CONTACT_RELATION: 16, // Added
  MANAGER_ID: 17, // Added
  IS_ADMIN: 18, // Adjusted index
  LAST_LOGIN: 19, // Adjusted index
  CREATED_AT: 20, // Adjusted index
  UPDATED_AT: 21, // Adjusted index
  OTP: 22, // Adjusted index
  OTP_EXPIRY: 23 // Adjusted index
};

// ===================
// WEB APP & UTILITIES
// ===================
function doGet(e) {
  Logger.log("[SERVER] doGet request received.");
  const htmlTemplate = HtmlService.createTemplateFromFile('Index');
  const settings = getCompanySettings();
  htmlTemplate.settings = settings;
  return htmlTemplate.evaluate()
    .setTitle(settings.CompanyName || 'NepHR')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

function include(filename) {
  Logger.log(`[SERVER] Including file: ${filename}.html`);
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Retrieves company settings from the SETTINGS sheet.
 * Handles Google Drive file IDs for logo and banner URLs.
 * @returns {Object} Company settings.
 */
function getCompanySettings() {
  Logger.log("[SERVER] Fetching company settings.");
  try {
    const sheet = ss.getSheetByName(SHEETS.SETTINGS);
    if (!sheet) {
      Logger.log("[SERVER-ERROR] Company_Settings sheet not found.");
      return { CompanyName: "NepHR (Config Error)", CompanyLogoURL: "", CustomBannerURL: "", DefaultUserPhotoURL: "" };
    }
    // Assuming settings are in A2:B<last row>
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    const settings = {};
    for (const row of data) {
      if (row[0]) {
        const settingValue = row[1];
        // Convert Google Drive file IDs to direct view URLs
        if (typeof settingValue === 'string' && settingValue.includes('drive.google.com/file/d/')) {
          const fileId = settingValue.split('/d/')[1].split('/')[0];
          settings[row[0]] = `https://drive.google.com/uc?export=view&id=${fileId}`;
        } else {
          settings[row[0]] = settingValue;
        }
      }
    }
    Logger.log("[SERVER] Company settings fetched:", settings);
    return settings;
  } catch (e) {
    Logger.log("[SERVER-ERROR] Error fetching company settings: " + e.toString());
    return { CompanyName: "NepHR (Error)", CompanyLogoURL: "", CustomBannerURL: "", DefaultUserPhotoURL: "" };
  }
}

/**
 * Generic helper to get all data from a sheet, skipping header.
 * @param {string} sheetName The name of the sheet.
 * @returns {Array<Array>} All data rows.
 */
function getSheetData(sheetName) {
  Logger.log(`[SERVER] Getting data from sheet: ${sheetName}`);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    Logger.log(`[SERVER-WARN] Sheet not found: ${sheetName}`);
    return [];
  }
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow <= 1) {
    Logger.log(`[SERVER] Sheet ${sheetName} has no data rows (only header or empty).`);
    return []; // Only header or empty
  }
  const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  Logger.log(`[SERVER] Data from ${sheetName}: ${JSON.stringify(data.slice(0, 5))}... (first 5 rows if many)`); // Log first few rows
  return data;
}

/**
 * Finds a row in a sheet based on a column value.
 * @param {string} sheetName The name of the sheet.
 * @param {number} colIndex The 0-based index of the column to search.
 * @param {any} value The value to search for.
 * @returns {Object|null} An object {userRecord: Array, rowIndex: number (1-based)} or null.
 */
function findRowByValue(sheetName, colIndex, value) {
  Logger.log(`[SERVER] Searching for value '${value}' in sheet '${sheetName}' column ${colIndex}.`);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    Logger.log(`[SERVER-WARN] Sheet not found for findRowByValue: ${sheetName}`);
    return null;
  }
  const data = sheet.getDataRange().getValues(); // Get all data including header for row index
  for (let i = 1; i < data.length; i++) { // Start from 1 to skip header
    if (data[i][colIndex] === value) {
      Logger.log(`[SERVER] Found row for '${value}' at index ${i + 1}.`);
      return { userRecord: data[i], rowIndex: i + 1 }; // +1 for 1-based row index
    }
  }
  Logger.log(`[SERVER] Value '${value}' not found in sheet '${sheetName}' column ${colIndex}.`);
  return null;
}

/**
 * Updates a specific cell or range in a sheet.
 * @param {string} sheetName The name of the sheet.
 * @param {number} rowIndex The 1-based row index.
 * @param {number} colIndex The 1-based column index.
 * @param {any} value The value to set.
 * @param {number} [numRows=1] Number of rows to update.
 * @param {number} [numCols=1] Number of columns to update.
 */
function updateRowInSheet(sheetName, rowIndex, colIndex, value, numRows = 1, numCols = 1) {
  Logger.log(`[SERVER] Updating sheet '${sheetName}' at R${rowIndex}C${colIndex} with value: ${value}`);
  const sheet = ss.getSheetByName(sheetName);
  if (sheet) {
    sheet.getRange(rowIndex, colIndex, numRows, numCols).setValue(value);
    Logger.log(`[SERVER] Update successful for sheet '${sheetName}'.`);
  } else {
    Logger.log(`[SERVER-ERROR] Error: Sheet ${sheetName} not found for update.`);
  }
}

// ===================
// AUTHENTICATION & PASSWORD RESET (unchanged, but uses new helper functions)
// ===================

/**
 * Retrieves authenticated user data from script properties using a session token.
 * @param {string} token Session token.
 * @returns {Object|null} User data object or null if token is invalid/expired.
 */
function getAuthenticatedUser(token) {
  Logger.log(`[SERVER] Attempting to get authenticated user for token: ${token ? token.substring(0, 10) + '...' : 'N/A'}`);
  if (!token) return null;
  const userData = PropertiesService.getScriptProperties().getProperty(token);
  if (userData) {
    const user = JSON.parse(userData);
    Logger.log(`[SERVER] User data found in properties for token: ${user.employeeId}`);
    // Optionally, re-fetch full user details from spreadsheet to ensure data freshness
    const employeeRowData = findRowByValue(SHEETS.EMPLOYEES, EMPLOYEE_COLS.ID, user.employeeId);
    if (employeeRowData) {
      const updatedUser = {
        employeeId: employeeRowData.userRecord[EMPLOYEE_COLS.ID],
        username: employeeRowData.userRecord[EMPLOYEE_COLS.USERNAME],
        fullName: `${employeeRowData.userRecord[EMPLOYEE_COLS.FIRSTNAME]} ${employeeRowData.userRecord[EMPLOYEE_COLS.LASTNAME]}`,
        photoUrl: employeeRowData.userRecord[EMPLOYEE_COLS.PHOTOURL] || getCompanySettings().DefaultUserPhotoURL,
        role: employeeRowData.userRecord[EMPLOYEE_COLS.ROLE],
        email: employeeRowData.userRecord[EMPLOYEE_COLS.EMAIL],
        phone: employeeRowData.userRecord[EMPLOYEE_COLS.PHONE],
        address: employeeRowData.userRecord[EMPLOYEE_COLS.ADDRESS],
        department: employeeRowData.userRecord[EMPLOYEE_COLS.DEPARTMENT],
        emergencyContactName: employeeRowData.userRecord[EMPLOYEE_COLS.EMERGENCY_CONTACT_NAME],
        emergencyContactPhone: employeeRowData.userRecord[EMPLOYEE_COLS.EMERGENCY_CONTACT_PHONE],
        emergencyContactRelation: employeeRowData.userRecord[EMPLOYEE_COLS.EMERGENCY_CONTACT_RELATION],
        joiningDate: employeeRowData.userRecord[EMPLOYEE_COLS.JOINING_DATE],
        // Add other fields as needed for profile management
      };
      // Update the session property with fresh data
      PropertiesService.getScriptProperties().setProperty(token, JSON.stringify(updatedUser));
      Logger.log("[SERVER] Authenticated user updated with fresh data.");
      return updatedUser;
    }
  }
  Logger.log("[SERVER] No authenticated user found for the provided token or data stale.");
  return null;
}

/**
 * Handles user login.
 * @param {string} username
 * @param {string} password
 * @returns {Object} Login result with success status, user data, and session token.
 */
function loginUser(username, password) {
  Logger.log(`[SERVER] Login attempt for username: ${username}`);
  const sheet = ss.getSheetByName(SHEETS.EMPLOYEES);
  if (!sheet) {
    Logger.log("[SERVER-ERROR] Employees sheet not found for login.");
    return { success: false, message: 'Internal error: Employee data unavailable.' };
  }
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues(); // Get all employee data
  const companySettings = getCompanySettings(); // Fetch company settings for default photo URL

  for (const row of data) {
    if (row[EMPLOYEE_COLS.USERNAME] === username && row[EMPLOYEE_COLS.PWHASH] === password && row[EMPLOYEE_COLS.STATUS] === 'Active') {
      const userSession = {
        employeeId: row[EMPLOYEE_COLS.ID],
        username: row[EMPLOYEE_COLS.USERNAME],
        fullName: `${row[EMPLOYEE_COLS.FIRSTNAME]} ${row[EMPLOYEE_COLS.LASTNAME]}`,
        photoUrl: row[EMPLOYEE_COLS.PHOTOURL] || companySettings.DefaultUserPhotoURL || '', // Use default if photoUrl is empty
        role: row[EMPLOYEE_COLS.ROLE],
        email: row[EMPLOYEE_COLS.EMAIL],
        phone: row[EMPLOYEE_COLS.PHONE],
        address: row[EMPLOYEE_COLS.ADDRESS],
        department: row[EMPLOYEE_COLS.DEPARTMENT],
        emergencyContactName: row[EMPLOYEE_COLS.EMERGENCY_CONTACT_NAME],
        emergencyContactPhone: row[EMPLOYEE_COLS.EMERGENCY_CONTACT_PHONE],
        emergencyContactRelation: row[EMPLOYEE_COLS.EMERGENCY_CONTACT_RELATION],
        joiningDate: row[EMPLOYEE_COLS.JOINING_DATE]
      };
      const sessionToken = Utilities.getUuid();
      PropertiesService.getScriptProperties().setProperty(sessionToken, JSON.stringify(userSession));

      // Update LAST_LOGIN timestamp
      const userRow = findRowByValue(SHEETS.EMPLOYEES, EMPLOYEE_COLS.ID, userSession.employeeId);
      if (userRow) {
        updateRowInSheet(SHEETS.EMPLOYEES, userRow.rowIndex, EMPLOYEE_COLS.LAST_LOGIN + 1, new Date());
      }

      logAction(userSession.employeeId, 'Login', userSession.employeeId, 'Success');
      Logger.log(`[SERVER] Login successful for user: ${username}`);
      return { success: true, user: userSession, token: sessionToken };
    }
  }
  logAction('N/A', 'Login Attempt', username, 'Invalid credentials or inactive account.');
  Logger.log(`[SERVER] Login failed for user: ${username}. Invalid credentials or inactive account.`);
  return { success: false, message: 'Invalid credentials or inactive account.' };
}

/**
 * Finds a user row by identifier (username, email, or phone).
 * @param {string} identifier
 * @returns {Object|null} User record and 1-based row index.
 */
function findUserRow(identifier) {
  Logger.log(`[SERVER] Searching for user row with identifier: ${identifier}`);
  const sheet = ss.getSheetByName(SHEETS.EMPLOYEES);
  if (!sheet) {
    Logger.log("[SERVER-ERROR] Employees sheet not found for findUserRow.");
    return null;
  }
  const data = sheet.getDataRange().getValues(); // Get all data including header
  for (let i = 1; i < data.length; i++) { // Start from 1 to skip header
    if (data[i][EMPLOYEE_COLS.USERNAME] === identifier || data[i][EMPLOYEE_COLS.EMAIL] === identifier || data[i][EMPLOYEE_COLS.PHONE] === identifier) {
      Logger.log(`[SERVER] User row found for identifier: ${identifier}`);
      return { userRecord: data[i], rowIndex: i + 1 };
    }
  }
  Logger.log(`[SERVER] User row not found for identifier: ${identifier}`);
  return null;
}

/**
 * Sends an OTP to the user's registered email.
 * @param {string} identifier Username, email, or phone.
 * @returns {Object} Success status and message.
 */
function sendOtp(identifier) {
  Logger.log(`[SERVER] Attempting to send OTP for identifier: ${identifier}`);
  if (!identifier) {
    Logger.log("[SERVER-WARN] OTP request: Identifier is required.");
    return { success: false, message: 'Identifier is required.' };
  }

  const userData = findUserRow(identifier);

  if (userData) {
    const userEmail = userData.userRecord[EMPLOYEE_COLS.EMAIL];
    const fullName = `${userData.userRecord[EMPLOYEE_COLS.FIRSTNAME]} ${userData.userRecord[EMPLOYEE_COLS.LASTNAME]}`;

    if (!userEmail || userEmail === "") {
      logAction(userData.userRecord[EMPLOYEE_COLS.USERNAME], 'OTP Send Fail', identifier, 'No email address registered.');
      Logger.log(`[SERVER-WARN] No email registered for ${identifier}.`);
      return { success: false, message: 'No email address registered for this account.' };
    }

    const otp = Math.floor(100000 + Math.random() * 900000);
    const otpExpiry = new Date(new Date().getTime() + 5 * 60000); // 5-minute expiry

    const sheet = ss.getSheetByName(SHEETS.EMPLOYEES);
    sheet.getRange(userData.rowIndex, EMPLOYEE_COLS.OTP + 1).setValue(otp);
    sheet.getRange(userData.rowIndex, EMPLOYEE_COLS.OTP_EXPIRY + 1).setValue(otpExpiry);
    Logger.log(`[SERVER] OTP generated for ${identifier}: ${otp}. Expiry: ${otpExpiry}`);

    const subject = "Your NepHR Password Reset OTP";
    const body = `Hello ${fullName},\n\nYour One-Time Password (OTP) to reset your NepHR password is:\n\n---
    ${otp}
---
\n\nThis OTP is valid for 5 minutes.\n\nThank you,\nThe NepHR Team`;

    try {
      MailApp.sendEmail(userEmail, subject, body);
      logAction(userData.userRecord[EMPLOYEE_COLS.USERNAME], 'OTP Sent', identifier, 'Email sent successfully.');
      Logger.log(`[SERVER] OTP email sent to ${userEmail}.`);
      return { success: true, message: 'An OTP has been sent to your registered email!' };
    } catch (e) {
      logAction(userData.userRecord[EMPLOYEE_COLS.USERNAME], 'OTP Send Fail', identifier, `Error: ${e.toString()}`);
      Logger.log(`[SERVER-ERROR] Error sending OTP email to ${userEmail}: ${e.toString()}`);
      return { success: false, message: 'Could not send OTP email. Please contact an administrator.' };
    }
  } else {
    // Security: Always return a generic success message to prevent username fishing.
    logAction('N/A', 'OTP Request', identifier, 'User not found in system.');
    Logger.log(`[SERVER-INFO] OTP request for unknown identifier: ${identifier}.`);
    return { success: true, message: 'If an account exists, an OTP has been sent to the registered email.' };
  }
}

/**
 * Resets user password using OTP.
 * @param {string} identifier Username, email, or phone.
 * @param {string} otp Provided OTP.
 * @param {string} newPassword New password.
 * @returns {Object} Success status and message.
 */
function resetPasswordWithOtp(identifier, otp, newPassword) {
  Logger.log(`[SERVER] Attempting password reset for identifier: ${identifier}`);
  if (!identifier || !otp || !newPassword) {
    Logger.log("[SERVER-WARN] Reset password: All fields are required.");
    return { success: false, message: "All fields are required." };
  }

  const userData = findUserRow(identifier);
  if (userData) {
    const sheet = ss.getSheetByName(SHEETS.EMPLOYEES);
    const storedOtp = sheet.getRange(userData.rowIndex, EMPLOYEE_COLS.OTP + 1).getValue();
    const storedExpiry = new Date(sheet.getRange(userData.rowIndex, EMPLOYEE_COLS.OTP_EXPIRY + 1).getValue());
    Logger.log(`[SERVER] Stored OTP: ${storedOtp}, Provided OTP: ${otp}, Stored Expiry: ${storedExpiry}`);

    if (!storedOtp || storedOtp === "" || new Date() > storedExpiry) {
      logAction(userData.userRecord[EMPLOYEE_COLS.USERNAME], 'Reset Fail', identifier, 'OTP expired or not found.');
      Logger.log(`[SERVER-WARN] OTP expired or not found for ${identifier}.`);
      return { success: false, message: "OTP has expired or is invalid. Please request a new one." };
    }

    if (parseInt(otp) === storedOtp) {
      sheet.getRange(userData.rowIndex, EMPLOYEE_COLS.PWHASH + 1).setValue(newPassword);
      sheet.getRange(userData.rowIndex, EMPLOYEE_COLS.OTP + 1, 1, 2).clearContent(); // Clear OTP fields
      Logger.log(`[SERVER] Password reset successful for ${identifier}.`);
      logAction(userData.userRecord[EMPLOYEE_COLS.USERNAME], 'Password Reset', identifier, 'Success via OTP');
      return { success: true, message: "Password reset successfully! Redirecting to login..." };
    } else {
      logAction(userData.userRecord[EMPLOYEE_COLS.USERNAME], 'Reset Fail', identifier, 'Invalid OTP.');
      Logger.log(`[SERVER-WARN] Invalid OTP provided for ${identifier}.`);
      return { success: false, message: "Invalid OTP. Please try again." };
    }
  }
  logAction('N/A', 'Reset Fail', identifier, 'User not found during reset.');
  Logger.log(`[SERVER-WARN] User not found during password reset for identifier: ${identifier}`);
  return { success: false, message: "User not found." };
}

/**
 * Logs out the current user by deleting their session token.
 * @param {string} token Session token to invalidate.
 */
function logoutUser(token) {
  Logger.log(`[SERVER] Attempting logout for token: ${token ? token.substring(0, 10) + '...' : 'N/A'}`);
  try {
    PropertiesService.getScriptProperties().deleteProperty(token);
    logAction('N/A', 'Logout', 'N/A', `Session ${token} invalidated.`);
    Logger.log(`[SERVER] Logout successful for token: ${token ? token.substring(0, 10) + '...' : 'N/A'}`);
    return { success: true, message: 'Logged out successfully.' };
  }
  catch (e) {
    Logger.log("[SERVER-ERROR] Error logging out: " + e.toString());
    return { success: false, message: 'Error logging out.' };
  }
}

// ===================
// DASHBOARD DATA & GENERAL FUNCTIONS
// ===================

/**
 * Fetches data for the respective dashboard (Admin or Employee).
 * This function will be expanded as more features are implemented.
 * @param {string} userRole Role of the logged-in user.
 * @param {string} employeeId ID of the logged-in employee (if employee role).
 * @returns {Object} Dashboard specific data.
 */
function getDashboardData(userRole, employeeId) {
  Logger.log(`[SERVER] getDashboardData called for role: ${userRole}, employeeId: ${employeeId}`);
  const companySettings = getCompanySettings();
  const allEmployees = getSheetData(SHEETS.EMPLOYEES);
  Logger.log(`[SERVER] Total employees fetched: ${allEmployees.length}`);

  const dashboardData = {
    companyName: companySettings.CompanyName,
    companyLogoUrl: companySettings.CompanyLogoURL,
    customBannerUrl: companySettings.CustomBannerURL,
    welcomeMessage: companySettings.WELCOME_MESSAGE || "Welcome Back!",
    motivationalQuote: companySettings.MOTIVATIONAL_QUOTE || "Strive for progress, not perfection.",
    // Default values for common dashboard items, will be overridden by role-specific data
    pendingLeaveRequests: 0,
    totalEmployees: 0,
    todayAttendance: { present: 0, absent: 0, lateCheckIns: 0 },
    tasksCompletedToday: 0,
    openTasks: 0,
    upcomingLeaves: 0,
    performanceAlerts: 0,
    estimatedMonthlySalary: 0,
  };

  if (userRole === 'Admin' || userRole === 'HR' || userRole === 'Manager') {
    Logger.log("[SERVER] Preparing Admin/HR/Manager Dashboard Data.");
    const activeEmployees = allEmployees.filter(e => e[EMPLOYEE_COLS.STATUS] === 'Active');
    dashboardData.totalEmployees = activeEmployees.length;

    const attendanceRecords = getSheetData(SHEETS.ATTENDANCE);
    Logger.log(`[SERVER] Raw attendance records fetched: ${attendanceRecords.length}`);
    const today = new Date();
    const todayAttendanceFiltered = attendanceRecords.filter(a => {
        // Assuming column 1 (index 1) in ATTENDANCE sheet is the date string
        return a[1] && new Date(a[1]).toDateString() === today.toDateString();
    });
    Logger.log(`[SERVER] Today's filtered attendance records: ${todayAttendanceFiltered.length}`);

    dashboardData.todayAttendance = {
      present: todayAttendanceFiltered.filter(a => a[3] === 'Present').length, // Assuming status is in column D (index 3)
      lateCheckIns: todayAttendanceFiltered.filter(a => a[3] === 'Late').length,
      absent: todayAttendanceFiltered.filter(a => a[3] === 'Absent').length, // This might need logic from employee list if no check-in record means absent
    };

    // For absent today, it's better to check all active employees who don't have a 'Present' record today
    const presentEmployeeIdsToday = todayAttendanceFiltered.filter(a => a[3] === 'Present').map(a => a[0]); // Assuming Employee ID is in column A (index 0)
    dashboardData.todayAttendance.absent = activeEmployees.filter(emp => !presentEmployeeIdsToday.includes(emp[EMPLOYEE_COLS.ID])).length;


    const leaveRequests = getSheetData(SHEETS.LEAVES);
    Logger.log(`[SERVER] Raw leave requests fetched: ${leaveRequests.length}`);
    dashboardData.pendingLeaveRequests = leaveRequests.filter(l => l[6] === 'Pending').length; // Assuming status is in column G (index 6)

    const tasks = getSheetData(SHEETS.TASKS);
    Logger.log(`[SERVER] Raw tasks fetched: ${tasks.length}`);
    dashboardData.openTasks = tasks.filter(t => t[7] === 'Pending' || t[7] === 'In Progress').length; // Assuming status is in column H (index 7)
    dashboardData.tasksCompletedToday = tasks.filter(t => t[7] === 'Completed' && new Date(t[6]).toDateString() === today.toDateString()).length; // Assuming completed_date is in column G (index 6)

    // Example for upcoming leaves (next 30 days)
    const upcomingLeavesList = leaveRequests.filter(l => {
        const endDate = new Date(l[4]); // Assuming End Date is in column E (index 4)
        return l[6] === 'Approved' && endDate >= today && endDate <= new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    });
    dashboardData.upcomingLeaves = upcomingLeavesList.length;

    // Placeholder for Performance Alerts (requires performance data and logic)
    dashboardData.performanceAlerts = 0; // Example: Math.floor(Math.random() * 5); // Dummy value

    // Placeholder for Estimated Monthly Salary (requires payroll data and employee salaries)
    dashboardData.estimatedMonthlySalary = 0; // Example: 500000; // Dummy value

    // Populate actual attendance history for table
    dashboardData.attendanceHistory = attendanceRecords.map(record => {
      const employee = allEmployees.find(emp => emp[EMPLOYEE_COLS.ID] === record[0]); // Assuming employee ID is in column A (index 0)
      return {
        employeeName: employee ? `${employee[EMPLOYEE_COLS.FIRSTNAME]} ${employee[EMPLOYEE_COLS.LASTNAME]}` : 'Unknown',
        checkInTime: record[2] ? new Date(record[2]).toLocaleTimeString() : 'N/A', // Assuming Check-in Time is in column C (index 2)
        checkOutTime: record[4] ? new Date(record[4]).toLocaleTimeString() : 'N/A', // Assuming Check-out Time is in column E (index 4)
        status: record[3] || 'N/A', // Assuming Status is in column D (index 3)
        overtime: record[5] || '0h', // Assuming Overtime is in column F (index 5)
      };
    }).sort((a, b) => new Date(b.checkInTime) - new Date(a.checkInTime)).slice(0, 10); // Latest 10 records
    Logger.log(`[SERVER] Admin Attendance History prepared: ${dashboardData.attendanceHistory.length} records.`);


    // Populate actual leave details for table
    dashboardData.leaveDetails = leaveRequests.map(leave => {
        const employee = allEmployees.find(emp => emp[EMPLOYEE_COLS.ID] === leave[0]); // Assuming Employee ID is in column A (index 0)
        return {
            employeeName: employee ? `${employee[EMPLOYEE_COLS.FIRSTNAME]} ${employee[EMPLOYEE_COLS.LASTNAME]}` : 'Unknown',
            leaveType: leave[1] || 'N/A', // Assuming Leave Type is in column B (index 1)
            startDate: leave[2] ? new Date(leave[2]).toLocaleDateString() : 'N/A', // Assuming Start Date is in column C (index 2)
            endDate: leave[3] ? new Date(leave[3]).toLocaleDateString() : 'N/A', // Assuming End Date is in column D (index 3)
            totalDays: leave[4] || 0, // Assuming Total Days is in column E (index 4)
            status: leave[6] || 'N/A', // Assuming Status is in column G (index 6)
        };
    }).sort((a, b) => new Date(b.startDate) - new Date(a.startDate)).slice(0, 10); // Latest 10 records
    Logger.log(`[SERVER] Admin Leave Details prepared: ${dashboardData.leaveDetails.length} records.`);


  } else if (userRole === 'Employee') {
    Logger.log("[SERVER] Preparing Employee Dashboard Data.");
    const employeeData = allEmployees.find(e => e[EMPLOYEE_COLS.ID] === employeeId);
    if (employeeData) {
      dashboardData.employeeInfo = {
        id: employeeData[EMPLOYEE_COLS.ID],
        username: employeeData[EMPLOYEE_COLS.USERNAME],
        fullName: `${employeeData[EMPLOYEE_COLS.FIRSTNAME]} ${employeeData[EMPLOYEE_COLS.LASTNAME]}`,
        photoUrl: employeeData[EMPLOYEE_COLS.PHOTOURL] || companySettings.DefaultUserPhotoURL || '',
        role: employeeData[EMPLOYEE_COLS.ROLE],
        email: employeeData[EMPLOYEE_COLS.EMAIL],
        phone: employeeData[EMPLOYEE_COLS.PHONE],
        address: employeeData[EMPLOYEE_COLS.ADDRESS],
        department: employeeData[EMPLOYEE_COLS.DEPARTMENT],
        joiningDate: employeeData[EMPLOYEE_COLS.JOINING_DATE],
        emergencyContactName: employeeData[EMPLOYEE_COLS.EMERGENCY_CONTACT_NAME],
        emergencyContactPhone: employeeData[EMPLOYEE_COLS.EMERGENCY_CONTACT_PHONE],
        emergencyContactRelation: employeeData[EMPLOYEE_COLS.EMERGENCY_CONTACT_RELATION]
      };

      const employeeLeaves = getSheetData(SHEETS.LEAVES).filter(l => l[0] === employeeId); // Assuming employee ID is in column A (index 0)
      dashboardData.leaveBalance = {
        totalAnnual: 20, // Example, fetch from Leave_Types or Employee-specific config
        used: employeeLeaves.filter(l => l[6] === 'Approved').length, // Count approved leaves
        remaining: 20 - employeeLeaves.filter(l => l[6] === 'Approved').length
      };

      const employeeTasks = getSheetData(SHEETS.TASKS).filter(t => t[1] === employeeId); // Assuming assigned_to_employee_id is in column B (index 1)
      dashboardData.taskSummary = {
        total: employeeTasks.length,
        pending: employeeTasks.filter(t => t[7] === 'Pending').length,
        inProgress: employeeTasks.filter(t => t[7] === 'In Progress').length,
        completed: employeeTasks.filter(t => t[7] === 'Completed').length,
      };

      const employeeNotifications = getSheetData(SHEETS.NOTIFICATIONS).filter(n => n[1] === employeeId || n[1] === 'ALL'); // Assuming recipient_id is in column B (index 1)
      dashboardData.recentNotifications = employeeNotifications.slice(-5).reverse().map(n => ({ // Last 5, most recent first
        id: n[0],
        type: n[2],
        message: n[3],
        date: n[4] // This needs to be a Date object or convert to string properly
      }));
      Logger.log(`[SERVER] Employee recent notifications: ${dashboardData.recentNotifications.length} records.`);

      // Placeholder for employee's own attendance status today
      const today = new Date();
      const employeeTodayAttendance = getSheetData(SHEETS.ATTENDANCE).find(a => a[0] === employeeId && a[1] && new Date(a[1]).toDateString() === today.toDateString());
      dashboardData.todayAttendance = { status: employeeTodayAttendance ? employeeTodayAttendance[3] : 'N/A' }; // Assuming status is in column D (index 3)

      // Placeholder for Performance Score
      // In a real scenario, you'd calculate this from performance review data or a dedicated column.
      dashboardData.performanceScore = Math.floor(Math.random() * (100 - 60 + 1)) + 60; // Random score between 60-100

      // Placeholder for Employee's Upcoming Leave Date
      const nextUpcomingLeave = employeeLeaves
          .filter(l => l[6] === 'Approved' && new Date(l[2]) >= today) // Approved and start date is today or in future
          .sort((a, b) => new Date(a[2]) - new Date(b[2]))[0]; // Sort by start date, take the earliest
      dashboardData.yourUpcomingLeaveDate = nextUpcomingLeave ? new Date(nextUpcomingLeave[2]).toLocaleDateString() : 'None';


    } else {
      Logger.log(`[SERVER-WARN] Employee not found for ID: ${employeeId} in getDashboardData.`);
    }
  }
  Logger.log(`[SERVER] Final dashboard data to be returned: ${JSON.stringify(dashboardData)}`);
  return dashboardData;
}

/**
 * Updates an employee's profile information.
 * @param {string} employeeId The ID of the employee to update.
 * @param {Object} profileData Object containing fields to update (e.g., email, phone, address, photoUrl).
 * @returns {Object} Success status and message.
 */
function updateUserProfile(employeeId, profileData) {
  Logger.log(`[SERVER] Updating profile for employeeId: ${employeeId}`);
  const userRow = findRowByValue(SHEETS.EMPLOYEES, EMPLOYEE_COLS.ID, employeeId);
  if (!userRow) {
    logAction(employeeId, 'Profile Update Fail', employeeId, 'User not found.');
    Logger.log(`[SERVER-ERROR] Profile update failed: User ${employeeId} not found.`);
    return { success: false, message: 'User not found.' };
  }

  const sheet = ss.getSheetByName(SHEETS.EMPLOYEES);
  const rowIdx = userRow.rowIndex;

  try {
    if (profileData.email !== undefined) sheet.getRange(rowIdx, EMPLOYEE_COLS.EMAIL + 1).setValue(profileData.email);
    if (profileData.phone !== undefined) sheet.getRange(rowIdx, EMPLOYEE_COLS.PHONE + 1).setValue(profileData.phone);
    if (profileData.address !== undefined) sheet.getRange(rowIdx, EMPLOYEE_COLS.ADDRESS + 1).setValue(profileData.address);
    if (profileData.photoUrl !== undefined) sheet.getRange(rowIdx, EMPLOYEE_COLS.PHOTOURL + 1).setValue(profileData.photoUrl);
    if (profileData.emergencyContactName !== undefined) sheet.getRange(rowIdx, EMPLOYEE_COLS.EMERGENCY_CONTACT_NAME + 1).setValue(profileData.emergencyContactName);
    if (profileData.emergencyContactPhone !== undefined) sheet.getRange(rowIdx, EMPLOYEE_COLS.EMERGENCY_CONTACT_PHONE + 1).setValue(profileData.emergencyContactPhone);
    if (profileData.emergencyContactRelation !== undefined) sheet.getRange(rowIdx, EMPLOYEE_COLS.EMERGENCY_CONTACT_RELATION + 1).setValue(profileData.emergencyContactRelation);

    // Update UPDATED_AT timestamp
    sheet.getRange(rowIdx, EMPLOYEE_COLS.UPDATED_AT + 1).setValue(new Date());

    logAction(employeeId, 'Profile Update', employeeId, 'Success.');
    Logger.log(`[SERVER] Profile updated successfully for ${employeeId}.`);
    return { success: true, message: 'Profile updated successfully!' };
  } catch (e) {
    logAction(employeeId, 'Profile Update Fail', employeeId, `Error: ${e.toString()}`);
    Logger.log(`[SERVER-ERROR] Failed to update profile for ${employeeId}: ${e.toString()}`);
    return { success: false, message: 'Failed to update profile: ' + e.message };
  }
}

/**
 * Allows a user to change their password from the dashboard.
 * @param {string} employeeId The ID of the employee.
 * @param {string} oldPassword The current password.
 * @param {string} newPassword The new password.
 * @returns {Object} Success status and message.
 */
function updateUserPassword(employeeId, oldPassword, newPassword) {
  Logger.log(`[SERVER] Password change attempt for employeeId: ${employeeId}`);
  const userRow = findRowByValue(SHEETS.EMPLOYEES, EMPLOYEE_COLS.ID, employeeId);
  if (!userRow) {
    logAction(employeeId, 'Password Change Fail', employeeId, 'User not found.');
    Logger.log(`[SERVER-ERROR] Password change failed: User ${employeeId} not found.`);
    return { success: false, message: 'User not found.' };
  }

  const sheet = ss.getSheetByName(SHEETS.EMPLOYEES);
  const storedHash = userRow.userRecord[EMPLOYEE_COLS.PWHASH]; // Assuming PWHASH is the stored password

  // In a real app, you would hash the oldPassword and compare it.
  // For simplicity, here we compare plain text as per previous implementation.
  if (oldPassword !== storedHash) {
    logAction(employeeId, 'Password Change Fail', employeeId, 'Incorrect old password.');
    Logger.log(`[SERVER-WARN] Incorrect old password for ${employeeId}.`);
    return { success: false, message: 'Incorrect old password.' };
  }

  try {
    sheet.getRange(userRow.rowIndex, EMPLOYEE_COLS.PWHASH + 1).setValue(newPassword);
    // Update UPDATED_AT timestamp
    sheet.getRange(userRow.rowIndex, EMPLOYEE_COLS.UPDATED_AT + 1).setValue(new Date());
    logAction(employeeId, 'Password Change', employeeId, 'Success.');
    Logger.log(`[SERVER] Password changed successfully for ${employeeId}.`);
    return { success: true, message: 'Password changed successfully!' };
  } catch (e) {
    logAction(employeeId, 'Password Change Fail', employeeId, `Error: ${e.toString()}`);
    Logger.log(`[SERVER-ERROR] Failed to change password for ${employeeId}: ${e.toString()}`);
    return { success: false, message: 'Failed to change password: ' + e.message };
  }
}

// UTILITY
/**
 * Logs an action to the System_Logs sheet.
 * @param {string} actorId The ID of the user performing the action.
 * @param {string} action Description of the action.
 * @param {string} targetId The ID of the entity affected.
 * @param {string} details More details about the action.
 */
function logAction(actorId, action, targetId, details) {
  try {
    const logSheet = ss.getSheetByName(SHEETS.LOGS);
    if (!logSheet) {
      Logger.log("[SERVER-ERROR] System_Logs sheet not found for logging action.");
      return;
    }
    // Log sheet columns: ID, Actor ID, Action, Target ID, Details, Timestamp, IP Address (optional)
    logSheet.appendRow([ `LOG-${Utilities.getUuid().slice(0, 8)}`, actorId, action, targetId, details, new Date(), 'N/A' ]);
    Logger.log(`[SERVER-LOG] Action: ${action}, Actor: ${actorId}, Target: ${targetId}, Details: ${details}`);
  } catch (e) {
    Logger.log("[SERVER-ERROR] Failed to write to log sheet: " + e.toString());
  }
}
