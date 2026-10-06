# SaveVolt ⚡️

SaveVolt is a comprehensive, local-first smart energy management React Native application designed to track, analyze, and dramatically reduce household energy consumption. 

## 🚀 The SaveVolt Difference

SaveVolt isn’t just another passive dashboard. It actively shifts behavior through:

1. **Proactive AI Predictions**: We use weather data, historical usage, and appliance specs to deliver predictive, actionable advice *before* your energy bill spikes.
2. **Community Gamification**: Turn energy savings into a social challenge with leaderboards, badges, and streaks.
3. **Actionable Eco-Impact**: Convert abstract "kWh" numbers into real-world metrics like "Trees Saved" and dollar amounts.

## 🛠 Features at a Glance

- **Instant Energy Audit**: Real-time consumption breakdown per appliance.
- **Predictive AI Tips**: Context-aware recommendations for efficiency.
- **Eco-Savings Dashboard**: Beautiful charts tracking your monthly cost, CO₂, and energy footprint.
- **Progress & Streaks**: Habit-building gamification mechanics.
- **Demo Data Generator**: Immediate onboarding value with generated mock history and appliances.

## 🗺 Roadmap

### Hardware Integration
SaveVolt is architected with an abstracted hardware integration layer (`IHardwareService`). 
- **Phase 1 (Current)**: UI demonstrations using `MockSmartPlugService`
- **Phase 2 (Upcoming)**: Real-time connections to smart plug APIs (e.g., TP-Link Kasa)
- **Phase 3 (Future)**: Whole-home integration with utility GreenButton data.

### Business & Monetization
- **SaveVolt Basic (Free)**: Core tracking, monthly reports, standard tips, and local storage.
- **SaveVolt Pro (Premium)**: Advanced predictive models, automated hardware control via smart plugs, and multi-home syncing.
- **Future Explorations**: Tokenized incentives for verified energy reduction, and potential direct hardware bundles.

## 💻 Tech Stack
- **Framework**: React Native (TypeScript)
- **State Management**: Zustand
- **Charting**: React Native Chart Kit
- **Data Persistence**: AsyncStorage

## 📦 Getting Started

Make sure you have completed the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

```sh
# Install dependencies
npm install

# Run on iOS
npm run ios

# Run on Android
npm run android
```

See [FEATURES.md](./FEATURES.md) for a deep dive into each capability.
