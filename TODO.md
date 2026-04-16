# BoGa - Expense Tracker

## Features

### Core Functionality
- [x] Add expense entries with predefined or custom items
- [x] Mark entries as paid/unpaid
- [x] Delete individual entries or all unpaid entries
- [x] Month/year navigation to view historical data
- [x] Automatic price tracking with timestamp

### Item Management
- [x] Predefined items (Water Bottle, Gas)
- [x] Add custom items with name, icon, and default price
- [x] Edit item prices with effective date tracking
- [x] Custom price items (enter amount each time)
- [x] Multiple currency support (SAR, INR, USD, GBP)

### Data & Export
- [x] Export data to CSV
- [x] Quick date ranges (Today, This Month, This Year)
- [x] Custom date range selection
- [x] Per-item spending breakdown in reports

### Security
- [x] Lock screen with password protection
- [x] Password-protected app access

### UI/UX
- [x] Apple HIG aesthetic with glassmorphism
- [x] Pure black background (#000000)
- [x] Apple semantic colors (Blue, Orange, Green, Red)
- [x] Currency symbol styled at 70% with reduced opacity
- [x] Uppercase labels with letter-spacing
- [x] 16px Squircle border-radius
- [x] Clean entry list with inset separators
- [x] 24px horizontal padding

### Technical
- [x] React Native / Expo framework
- [x] AsyncStorage for local persistence
- [x] Haptic feedback on interactions
- [x] Cross-platform (iOS, Android, Web)
- [x] Netlify deployment (static export)

## Deployment

**Live URL:** https://boga-app.netlify.app

### Build for Deployment
```bash
npx expo export --platform web
```

### Deploy to Netlify
```bash
netlify deploy --dir=dist --prod
```

## Future Enhancements

- [ ] Recurring expense templates
- [ ] Budget limits and alerts
- [ ] Data import from CSV
- [ ] Cloud sync across devices
- [ ] Dark/Light theme toggle
- [ ] Categories and tags
- [ ] Charts and spending analytics
- [ ] Push notifications for due payments
