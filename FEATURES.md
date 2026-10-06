# 🌱 Energy Tracker App - Complete Feature Documentation

## 📱 Overview
A comprehensive React Native application for tracking, analyzing, and reducing energy consumption with smart insights, personalized tips, and gamification features.

---

## ✨ Implemented Features

### 1. ✅ Usage Input Form
**Location:** `src/screens/UsageInputScreen.tsx`

**Features:**
- Manual input for appliances with:
  - Appliance name
  - Power rating (watts)
  - Hours of use per day
  - Quantity
  - Category selection
- **Quick Select Presets** for common appliances (LED, AC, Refrigerator, etc.)
- Real-time validation
- Auto-saving to AsyncStorage
- Current appliance count display
- User-friendly interface with hints and tooltips

**Workflow:** Add appliance → Auto-validate → Save → Update dashboard

---

### 2. ⚡ Instant Energy Audit
**Location:** `src/screens/EnergyAuditScreen.tsx`

**Features:**
- **Real-time consumption calculation** for each appliance
- Ranked list (top consumers first)
- Toggle appliances on/off to see impact
- Detailed breakdown per appliance:
  - Daily energy consumption (kWh)
  - Monthly projection
  - Cost calculations
  - Power specs (watts, hours, quantity)
- Delete appliance functionality
- Color-coded priority indicators

**Formula Used:** `Energy (kWh) = (Power × Time × Quantity) / 1000`

---

### 3. 📊 Eco-Savings Dashboard
**Location:** `src/screens/DashboardScreen.tsx`

**Features:**
- **4 Key Metrics Cards:**
  - Total monthly energy (kWh)
  - Total monthly cost ($)
  - CO₂ emissions (kg)
  - Tree equivalent
  
- **Visual Charts:**
  - Pie Chart: Consumption by category
  - Bar Chart: Top consumers breakdown
  
- **Environmental Impact Section:**
  - CO₂ emissions in context
  - Tree equivalents for offset
  - Potential savings calculator
  
- **Cost Analysis:**
  - Cost breakdown by category
  - Color-coded categories

**Calculation:** 
- CO₂: `0.92 kg CO₂ per kWh`
- Trees: `21.77 kg CO₂ per tree per year`

---

### 4. 📈 Energy Usage Dashboard (Trends)
**Location:** `src/screens/TrendsScreen.tsx`

**Features:**
- **3 Time Periods:**
  - Daily (7 days)
  - Weekly (4 weeks)
  - Monthly (3 months)
  
- **Line Chart** showing consumption trends
- **Comparison Analysis:**
  - Current vs previous period
  - Percentage change
  - Improvement indicator (✅/⚠️)
  
- **Period Averages:**
  - Average energy/day
  - Average cost/day
  - Average CO₂/day
  
- **Top 3 Consumers** with medals (🥇🥈🥉)
- **Insights & Recommendations** based on performance

---

### 5. 💡 Smart Energy Tips
**Location:** `src/screens/TipsScreen.tsx` + `src/utils/tips.ts`

**Features:**
- **AI-Generated Personalized Tips** based on:
  - Your appliance usage patterns
  - Top energy consumers
  - Usage duration
  - Appliance categories
  
- **Priority Levels:**
  - 🔴 High Priority (immediate action)
  - 🟠 Medium Priority (recommended)
  - 🟢 Low Priority (optional)
  
- **Tip Categories:**
  - Lighting optimization
  - Cooling/heating efficiency
  - Kitchen appliances
  - General energy saving
  
- **Each Tip Shows:**
  - Title and description
  - Potential monthly savings (kWh)
  - Category tag
  - "For You" badge for personalized tips

**Tip Engine:** Rule-based algorithm analyzing consumption patterns

---

### 6. 🔔 Reminders & Notifications
**Location:** `src/screens/RemindersScreen.tsx`, `src/services/NotificationService.ts`, `src/services/notifications/`

**Features:**
- Create reminders for a specific appliance or habit, at a set time (24-hour) on chosen weekdays
- **Real device notifications:** each active reminder is scheduled as a weekly repeating local notification and rescheduled whenever reminders or the Notifications setting change (`reminderScheduler.ts`)
- **Energy alerts:** high monthly usage (> 300 kWh), high projected cost (> 50), paused appliances, and 7-day streak milestones — each sent at most once per day/milestone (`NotificationHelper.ts`)
- **Badge notifications** when a new achievement is earned
- Quiet hours (22:00–08:00) for alerts; everything respects the in-app Notifications toggle
- Android 13+ asks for notification permission when notifications are on; on Android 12+ reminders need the "Alarms & reminders" permission — the Reminders screen explains this and opens the system setting (native helper `android/app/src/main/java/com/savevolt/ExactAlarmModule.kt`)
- All wiring lives in one hook, `useNotificationSync`, mounted once in `App.tsx`

**Examples:**
- "Turn off lights before sleep"
- "Check AC temperature at 6 PM"
- "Weekly appliance maintenance reminder"

---

### 7. 🌍 Carbon Footprint Conversion
**Integrated across all screens**

**Features:**
- **Real-time CO₂ calculation** from energy usage
- **Tree Equivalent Conversion**
  - Shows how many trees needed to offset emissions
  - Visual representation of environmental impact
- **Savings Tracker**
  - CO₂ reduction over time
  - Environmental goal setting
  
**Conversion Factors:**
- Grid CO₂: `0.92 kg CO₂/kWh`
- Tree absorption: `21.77 kg CO₂/tree/year`

---

### 8. 💰 Energy Cost Estimator
**Integrated in all calculation screens**

**Features:**
- **Configurable Electricity Rate** ($/kWh)
- **Multi-level Cost Calculation:**
  - Daily cost per appliance
  - Monthly projections
  - Total household cost
  - Category-wise breakdown
- **Currency Customization**
- **Cost Comparison** period-over-period

**Calculation:** `Cost = Energy (kWh) × Rate ($/kWh)`

---

### 9. 📄 Monthly Summary Report / Export Reports
**Location:** `src/screens/ReportsScreen.tsx`

**Features:**
- **Auto-Generated Reports:**
  - Monthly energy summary
  - Top 3 consumers breakdown
  - Category consumption
  - Appliance list with specs
  - Progress & streak data
  - Top 5 energy-saving tips
  
- **Export Formats:**
  - 📱 Text Report (share via messaging/email)
  - 📊 CSV Data Export (for spreadsheets)
  - 📄 View Full Report in-app
  
- **Recent Activity Log**
- **What's Included Preview**

**Sharing:** Integrated with React Native Share API

---

### 10. 🏆 Progress & Streak Tracker
**Location:** `src/screens/ProgressScreen.tsx`

**Features:**
- **Streak System:**
  - Current daily streak (🔥)
  - Longest streak record
  - Total active days
  - Last activity date
  
- **Goal Setting:**
  - Energy consumption goals
  - Cost reduction targets
  - CO₂ reduction goals
  - Progress bars with percentages
  - Deadline tracking
  
- **Badge System:**
  - 🌱 First Steps (add first appliance)
  - 🔥 Week Warrior (7-day streak)
  - ⚡ Energy Saver (20% reduction)
  - 🌳 Green Champion (10 trees saved)
  
- **Overall Stats Dashboard**

**Gamification:** Motivates long-term engagement through achievements

---

### 11. 🤖 Virtual Energy Assistant (Chatbot)
**Location:** `src/screens/ChatScreen.tsx` + `src/utils/tips.ts`

**Features:**
- **AI-Powered Chat Interface**
- **Natural Language Understanding** for queries:
  - "How can I save energy?"
  - "Show my consumption"
  - "Calculate my bill"
  - "Environmental impact"
  
- **Contextual Responses** based on:
  - Your appliance data
  - Usage patterns
  - Current tips
  
- **Quick Suggestions:** Context-aware follow-up questions
- **Conversation History**
- **User-Friendly UI** with message bubbles and a typing indicator
- **Optional Gemini:** add a Gemini API key in Settings for AI answers; the local engine is the fallback
- **Voice input:** tap the microphone to ask by voice (live transcript while listening). Navigation phrases such as "show my progress" or "show energy tips" open that screen; anything else is sent as a question (`src/services/VoiceCommandService.ts`)
- **Spoken replies** when "Voice Tips" is on in Settings

**Response Engine:** Pattern matching + data-driven insights

---

### 12. 🌤️ Weather-Based & Seasonal Tips
**Location:** `src/services/api/weatherApi.ts` + `src/utils/tips.ts` + `src/components/WeatherWidget.tsx`

**Features:**
- **Live weather** from Open-Meteo (geocoding + current conditions, no API key), with a seasonal estimate when offline (marked "EST")
- **Weather widget** on the Dashboard (tap to open Tips) and at the top of Tips; pull down on either screen to refresh
- **Seasonal Recommendations:**
  - 🌸 Spring tips
  - ☀️ Summer cooling advice
  - 🍂 Fall optimization
  - ❄️ Winter heating tips
  
- **Temperature-Based Alerts:**
  - Hot weather (>30°C): AC optimization
  - Cold weather (<15°C): Heating efficiency
  - Humidity alerts: Dehumidifier tips
  
- **Location-based** recommendations (city set in Settings)

---

### 13. 🎯 Smart Goal Setting (Advanced)
**Location:** `src/screens/ProgressScreen.tsx` + Context

**Features:**
- **Multiple Goal Types:**
  - Energy consumption reduction
  - Cost savings
  - CO₂ reduction targets
  
- **Smart Features:**
  - Track current vs target
  - Progress visualization
  - Deadline management
  - Achievement notifications
  
- **Historical Pattern Analysis** (foundation ready)
- **Realistic Target Suggestions** based on usage

---

### 14. ⚙️ Settings & Customization
**Location:** `src/screens/SettingsScreen.tsx`

**Features:**
- **Energy Settings:**
  - Custom electricity rate
  - Currency symbol
  - CO₂ emission factor
  
- **Location Settings:**
  - Weather location (city name)
  
- **App Preferences:**
  - Notifications on/off (alerts and reminders)
  - Dark mode
  - Voice tips (text-to-speech)
  
- **AI Assistant:** optional Gemini API key with a connection test

- **About Section:**
  - App version
  - Description

---

### 15. 👋 Onboarding
**Location:** `src/screens/OnboardingScreen.tsx`

- Four-slide welcome carousel shown on first launch (Skip / Next / Get Started); completion is saved so it shows once

---

### 16. 🌙 Dark Mode
**Location:** `src/theme/index.ts`, `src/context/ThemeContext.tsx`

- Every screen, the tab bar, stack headers, and the error screen follow the Dark Mode setting
- Light and dark palettes share the same tokens; screens build styles with `useThemedStyles(createStyles)`
- `primaryText` / `dangerText` tokens keep green and red text readable (≥ 4.5:1) on light surfaces

---

### 17. ✏️ Edit Appliances
**Location:** `src/screens/EditApplianceScreen.tsx`

- Edit name, power, hours, quantity, and category; delete with confirmation
- Open from the Energy Audit ("Edit Details") or by tapping a Top Consumer on the Dashboard
- Deleting an appliance also removes it from rooms and reminders

---

### 18. ♿ Accessibility & Polish
- Screen-reader labels, roles, and states (selected, checked, busy) on interactive elements; headers marked; decorative emoji hidden
- Charts have spoken summaries; touch targets are at least 44×44
- Shared empty states with clear next actions, and skeleton placeholders while weather or AI summaries load
- Branded splash screen on Android and iOS; vector icons in the tab bar

---

## 🛠️ Technical Architecture

### **State Management**
- **Zustand** store (`src/store/energyStore.ts`) persisted to **AsyncStorage**
- `useEnergy('appliances', 'settings', …)` selects only the keys a screen uses, so screens re-render only when that data changes
- `ThemeContext` derives the palette from the Dark Mode setting

### **Data Flow**
```
User Input → Zustand store → AsyncStorage → Dashboard / tips / goals recalculated → Screens
```

### **Key Utilities**
1. **energy.ts** - Core calculations (kWh, cost, CO₂)
2. **tips.ts** - Tip generation engine
3. **services/api/weatherApi.ts** - Live weather with offline fallback
4. **services/notifications/** - Alerts, reminder scheduling, and sync hook

### **Navigation**
- Five tabs — Home, Track, Insights, Goals, Account — each with a hub screen and its own stack
- Vector tab icons, themed headers with a floating back button

---

## 📊 Screen Flow

```
📊 Dashboard (Overview)
    ↓
➕ Add Appliances (Input)
    ↓
⚡ Energy Audit (Analysis)
    ↓
📈 Trends (Historical)
    ↓
💡 Tips (Recommendations)
    ↓
🤖 Chat Assistant (Q&A)
    ↓
🏆 Progress (Achievements)
    ↓
📄 Reports (Export)
    ↓
⚙️ Settings (Configuration)
```

---

## 🎨 Design Highlights

- **Color-Coded Screens:** Each screen has a unique theme color
- **Emoji Icons:** Intuitive visual language
- **Card-Based UI:** Clean, modern design
- **Charts & Graphs:** Visual data representation
- **Responsive Layout:** Works on all screen sizes
- **Accessibility:** Clear labels and hints

---

## 🚀 How to Run

```bash
# Install dependencies
npm install

# Run on iOS
npm run ios

# Run on Android
npm run android

# Start Metro bundler
npm start
```

---

## 📦 Key Dependencies

- `@react-navigation/native` - Navigation
- `@react-native-async-storage/async-storage` - Data persistence
- `react-native-chart-kit` - Charts & graphs
- `react-native-svg` - Chart rendering
- `date-fns` - Date formatting
- `react-native-share` - Export functionality

---

## 🎯 Feature Prioritization (Appathon)

### **MVP (Must Have) - Completed ✅**
1. Usage Input Form
2. Energy Audit
3. Eco-Savings Dashboard
4. Smart Energy Tips
5. Monthly Report

### **Enhanced (Should Have) - Completed ✅**
6. Trends Analysis
7. Progress Tracker
8. Cost Estimator
9. Carbon Footprint

### **Advanced (Nice to Have) - Completed ✅**
10. Virtual Assistant
11. Weather Tips
12. Goal Setting
13. Export Reports

---

## 🏆 Core Differentiators

1. **Proactive & Predictive AI Recommendations:** Instead of passive monitoring, SaveVolt uses context (weather, historical usage, high consumers) to predictively alert you to savings opportunities *before* they happen.
2. **Community-Driven Social Engagement:** Turn energy saving into a team sport with community challenges, leaderboards, and collective goals.
3. **Multi-Modal Interaction:** Interactive voice/chat support for accessibility.
4. **Actionable Eco-Impact:** Tangible environmental conversions (CO₂ to Trees).
5. **Robust Local-First Architecture:** Ensures privacy and immediate feedback.

---

## 📝 Hardware Integration Roadmap

SaveVolt is designed to eventually integrate directly with real-world energy consumption devices.
- **Phase 1 (Current):** Mock integrations to demonstrate UI capability and projection models.
- **Phase 2 (Upcoming):** Integration with major smart plug APIs (e.g., Kasa, Tuya) to read live wattage.
- **Phase 3 (Future):** Utility API connections (e.g., GreenButton) for whole-home energy data.

---

## 💰 Monetization Strategy

- **Freemium Model:** Basic tracking, monthly reports, and standard AI tips remain free.
- **SaveVolt Pro:** Premium subscription for advanced predictive modeling, real-time hardware integration, and multi-home support.
- **Hardware Partnerships:** Future bundles with smart plugs and IoT sensors.

---

## 📝 Future Explorations

- [ ] Smart home IoT integration (Phase 2)
- [x] Local notifications for reminders and energy alerts
- [ ] Remote push via Firebase (code is ready; needs a Firebase project and `google-services.json`)
- [ ] Multi-user/household support
- [ ] *Exploratory:* Blockchain for transparent carbon credit tracking and tokenized incentives (currently de-emphasized to prioritize core predictive capabilities).

---

## 👨‍💻 Development Notes

All features are **fully functional** with:
- ✅ Complete TypeScript types
- ✅ Error handling
- ✅ Data validation
- ✅ Persistent storage
- ✅ Responsive UI, light and dark

Calculations use your own appliance data; "Load demo data" on the empty Dashboard fills in sample appliances and history for a quick tour.

**Checks:** `npx tsc --noEmit`, `npm run lint`, and `npm test` (unit tests plus a smoke test that renders every screen in light and dark mode with empty and demo data).

---

## 📞 Support

For questions or issues, check the code comments or refer to:
- `src/types/index.ts` - All TypeScript interfaces
- `src/utils/energy.ts` - Calculation formulas
- `src/store/energyStore.ts` - State management

---

**Built with ❤️ for sustainable living** 🌍
