import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Modal, Pressable, TextInput, Switch, Alert, FlatList, Platform, SafeAreaView, StatusBar, KeyboardAvoidingView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

type Currency = 'SAR' | 'INR' | 'USD' | 'GBP';

interface Item {
  id: string;
  name: string;
  icon: string;
  price: number;
  priceHistory?: { price: number; effectiveDate: number }[];
  customPrice?: boolean;
}

interface Entry {
  id: string;
  itemId: string;
  timestamp: number;
  paid: boolean;
  priceAtTime: number;
}

interface AppSettings {
  theme: 'dark' | 'light';
  currency: Currency;
  lockEnabled: boolean;
  lockPassword: string;
}

const STORAGE_KEY = '@boga_entries';
const SETTINGS_KEY = '@boga_settings';

const CURRENCIES: { code: Currency; symbol: string; name: string }[] = [
  { code: 'SAR', symbol: 'ر.س', name: 'Saudi Riyal' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupees' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'GBP', symbol: '£', name: 'Pound' },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const DEFAULT_ITEMS: Item[] = [
  { id: 'water', name: 'Water Bottle', icon: '💧', price: 10, priceHistory: [] },
  { id: 'gas', name: 'Gas', icon: '🔥', price: 50, priceHistory: [] },
];

const darkTheme = {
  bg: '#0F172A',
  card: '#1E293B',
  cardAlt: '#334155',
  accent: '#22C55E',
  fg: '#F8FAFC',
  fgMuted: '#94A3B8',
  destructive: '#EF4444',
  success: '#22C55E',
  warning: '#F59E0B',
  border: '#334155',
};

const lightTheme = {
  bg: '#F8FAFC',
  card: '#E2E8F0',
  cardAlt: '#CBD5E1',
  accent: '#16A34A',
  fg: '#0F172A',
  fgMuted: '#64748B',
  destructive: '#DC2626',
  success: '#16A34A',
  warning: '#D97706',
  border: '#CBD5E1',
};

export default function App() {
  const [items, setItems] = useState<Item[]>(DEFAULT_ITEMS);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    theme: 'dark',
    currency: 'SAR',
    lockEnabled: false,
    lockPassword: '',
  });
  
  const [mode, setMode] = useState<'main' | 'settings' | 'addItem' | 'report' | 'export'>('main');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedEntries, setSelectedEntries] = useState<string[]>([]);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(!settings.lockEnabled);
  const [lockInput, setLockInput] = useState('');
  
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [editItemIcon, setEditItemIcon] = useState('📦');
  const [showItemEditor, setShowItemEditor] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [priceChangeDate, setPriceChangeDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);
  const [showCustomPriceModal, setShowCustomPriceModal] = useState(false);
  const [customPriceItem, setCustomPriceItem] = useState<Item | null>(null);
  const [customPriceAmount, setCustomPriceAmount] = useState('');
  const [newItemIsCustom, setNewItemIsCustom] = useState(false);

  const theme = settings.theme === 'dark' ? darkTheme : lightTheme;
  const currencySymbol = CURRENCIES.find(c => c.code === settings.currency)?.symbol || 'ر.س';

  const getPriceAtTime = useCallback((item: Item, timestamp: number): number => {
    const history = item.priceHistory || [];
    const sorted = [...history].sort((a, b) => b.effectiveDate - a.effectiveDate);
    const applicable = sorted.find(h => timestamp >= h.effectiveDate);
    return applicable ? applicable.price : item.price;
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const storedEntries = await AsyncStorage.getItem(STORAGE_KEY);
      const storedSettings = await AsyncStorage.getItem(SETTINGS_KEY);
      if (storedEntries) setEntries(JSON.parse(storedEntries));
      if (storedSettings) setSettings(JSON.parse(storedSettings));
    } catch (e) { console.error('Load error', e); }
  };

  const saveData = async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) { console.error('Save error', e); }
  };

  useEffect(() => { saveData(); }, [entries, settings]);

  const triggerHaptic = useCallback(() => { 
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch(e) {}
  }, []);
  const lightHaptic = useCallback(() => { 
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch(e) {} 
  }, []);

  const showConfirm = useCallback((title: string, message: string, onConfirm: () => void) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', style: 'destructive', onPress: () => { triggerHaptic(); onConfirm(); } },
    ]);
  }, [triggerHaptic]);

  const addEntry = useCallback((itemId: string, customAmount?: number) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    triggerHaptic();
    const newEntry: Entry = {
      id: Date.now().toString(),
      itemId,
      timestamp: Date.now(),
      paid: false,
      priceAtTime: customAmount !== undefined ? customAmount : getPriceAtTime(item, Date.now()),
    };
    setEntries(prev => [newEntry, ...prev]);
  }, [items, triggerHaptic, getPriceAtTime]);

  const handleItemPress = useCallback((item: Item) => {
    if (item.customPrice) {
      setCustomPriceItem(item);
      setCustomPriceAmount(item.price.toString());
      setShowCustomPriceModal(true);
    } else {
      addEntry(item.id);
    }
  }, [addEntry]);

  const deleteEntry = useCallback((entryId: string) => {
    const entry = entries.find(e => e.id === entryId);
    if (entry?.paid) {
      showConfirm('Delete Paid Entry', 'This entry is marked as paid. Delete anyway?', () => {
        setEntries(prev => prev.filter(e => e.id !== entryId));
      });
    } else {
      setEntries(prev => prev.filter(e => e.id !== entryId));
    }
  }, [entries, showConfirm]);

  const deleteUnpaidAll = useCallback(() => {
    const toDelete = entries.filter(e => {
      const d = new Date(e.timestamp);
      const inMonth = d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
      return inMonth && !e.paid;
    });
    
    if (toDelete.length === 0) {
      Alert.alert('No Unpaid', 'No unpaid entries to delete for this month');
      return;
    }
    
    setEntries(prev => prev.filter(e => !toDelete.some(d => d.id === e.id)));
    setShowDeleteModal(false);
  }, [entries, selectedMonth, selectedYear]);

  const togglePaid = useCallback((entryId: string) => {
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, paid: !e.paid } : e));
  }, []);

  const toggleSelectEntry = useCallback((entryId: string) => {
    lightHaptic();
    setSelectedEntries(prev => 
      prev.includes(entryId) ? prev.filter(id => id !== entryId) : [...prev, entryId]
    );
  }, [lightHaptic]);

  const markSelectedPaid = useCallback(() => {
    triggerHaptic();
    setEntries(prev => prev.map(e => selectedEntries.includes(e.id) ? { ...e, paid: true } : e));
    setSelectedEntries([]);
    setShowPayModal(false);
  }, [selectedEntries, triggerHaptic]);

  const getSelectedCost = useCallback(() => {
    return selectedEntries.reduce((sum, id) => {
      const entry = entries.find(e => e.id === id);
      return sum + (entry?.priceAtTime || 0);
    }, 0);
  }, [selectedEntries, entries]);

  const addNewItem = useCallback(() => {
    if (!newItemName.trim() || !newItemPrice) {
      Alert.alert('Error', 'Enter name and price');
      return;
    }
    const newItem: Item = {
      id: Date.now().toString(),
      name: newItemName.trim(),
      icon: editItemIcon,
      price: parseFloat(newItemPrice) || 0,
      priceHistory: [],
      customPrice: newItemIsCustom,
    };
    setItems(prev => [...prev, newItem]);
    setNewItemName('');
    setNewItemPrice('');
    setEditItemIcon('📦');
    setNewItemIsCustom(false);
    setMode('main');
  }, [newItemName, newItemPrice, editItemIcon, newItemIsCustom]);

  const updateItemPrice = useCallback(() => {
    if (!editingItem || !newItemPrice) return;
    const effectiveDate = new Date(priceChangeDate).getTime();
    const updatedItems = items.map(item => {
      if (item.id === editingItem.id) {
        const history = item.priceHistory || [];
        return {
          ...item,
          price: parseFloat(newItemPrice),
          priceHistory: [...history, { price: parseFloat(newItemPrice), effectiveDate }],
        };
      }
      return item;
    });
    setItems(updatedItems);
    setShowItemEditor(false);
    setEditingItem(null);
    setNewItemPrice('');
  }, [editingItem, newItemPrice, priceChangeDate, items]);

  const openItemEditor = useCallback((item: Item) => {
    setEditingItem(item);
    setNewItemPrice(item.price.toString());
    setPriceChangeDate(new Date().toISOString().split('T')[0]);
    setShowItemEditor(true);
  }, []);

  const handleExport = useCallback(() => {
    const start = reportStartDate ? new Date(reportStartDate).getTime() : 0;
    const end = reportEndDate ? new Date(reportEndDate).getTime() + 86400000 : Date.now();
    
    const filtered = entries.filter(e => e.timestamp >= start && e.timestamp <= end);
    
    let csv = 'Date,Item,Price,Currency,Paid\n';
    filtered.forEach(e => {
      const item = items.find(i => i.id === e.itemId);
      csv += `${new Date(e.timestamp).toLocaleDateString()},${item?.name || '?'},${e.priceAtTime},${settings.currency},${e.paid ? 'Yes' : 'No'}\n`;
    });
    
    const total = filtered.reduce((sum, e) => sum + e.priceAtTime, 0);
    csv += `\nTotal,,${total},${settings.currency},\n`;
    
    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `boga-export-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      Alert.alert('Exported', `CSV saved. Total: ${currencySymbol}${total.toFixed(2)}`);
    }
    setShowReportModal(false);
  }, [reportStartDate, reportEndDate, entries, items, settings.currency, currencySymbol]);

  const handleImport = useCallback(() => {
    Alert.alert('Import', 'To import: Place a CSV file in your device storage and the app will parse it. Use format: Date,ItemName,Price,Currency,Paid');
  }, []);

  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      const d = new Date(e.timestamp);
      return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    });
  }, [entries, selectedMonth, selectedYear]);

  const unpaidCount = useMemo(() => filteredEntries.filter(e => !e.paid).length, [filteredEntries]);
  const unpaidCost = useMemo(() => filteredEntries.filter(e => !e.paid).reduce((sum, e) => sum + e.priceAtTime, 0), [filteredEntries]);
  const paidCost = useMemo(() => filteredEntries.filter(e => e.paid).reduce((sum, e) => sum + e.priceAtTime, 0), [filteredEntries]);

  const reportData = useMemo(() => {
    const start = reportStartDate ? new Date(reportStartDate).getTime() : 0;
    const end = reportEndDate ? new Date(reportEndDate).getTime() + 86400000 : Date.now();
    
    const filtered = entries.filter(e => e.timestamp >= start && e.timestamp <= end);
    return items.map(item => {
      const itemEntries = filtered.filter(e => e.itemId === item.id);
      return {
        item,
        count: itemEntries.length,
        paid: itemEntries.filter(e => e.paid).length,
        unpaid: itemEntries.filter(e => !e.paid).length,
        total: itemEntries.reduce((sum, e) => sum + e.priceAtTime, 0),
      };
    }).filter(r => r.count > 0);
  }, [reportStartDate, reportEndDate, entries, items]);

  if (settings.lockEnabled && !isUnlocked) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <StatusBar barStyle={settings.theme === 'dark' ? 'light-content' : 'dark-content'} />
        <View style={styles.centerScreen}>
          <Text style={[styles.logo, { color: theme.fg }]}>🔒</Text>
          <Text style={[styles.title, { color: theme.fg }]}>BoGa Locked</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.card, color: theme.fg, borderColor: theme.border }]}
            placeholder="Enter password"
            placeholderTextColor={theme.fgMuted}
            value={lockInput}
            onChangeText={setLockInput}
            secureTextEntry
          />
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: theme.accent }]}
            onPress={() => {
              if (lockInput === settings.lockPassword) {
                triggerHaptic();
                setIsUnlocked(true);
              } else {
                Alert.alert('Error', 'Wrong password');
              }
              setLockInput('');
            }}
          >
            <Text style={styles.btnText}>Unlock</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (mode === 'addItem') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <StatusBar barStyle={settings.theme === 'dark' ? 'light-content' : 'dark-content'} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setMode('main')}>
            <Text style={[styles.backBtn, { color: theme.accent }]}>← Back</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.fg }]}>Add New Item</Text>
          <View style={{ width: 60 }} />
        </View>
        
        <KeyboardAvoidingView behavior="padding" style={styles.content}>
          <Text style={[styles.label, { color: theme.fg }]}>Item Name</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.card, color: theme.fg, borderColor: theme.border }]}
            placeholder="e.g., Milk, Bread"
            placeholderTextColor={theme.fgMuted}
            value={newItemName}
            onChangeText={setNewItemName}
          />
          
          <Text style={[styles.label, { color: theme.fg }]}>Default Price ({settings.currency})</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.card, color: theme.fg, borderColor: theme.border }]}
            placeholder="0.00"
            placeholderTextColor={theme.fgMuted}
            value={newItemPrice}
            onChangeText={setNewItemPrice}
            keyboardType="decimal-pad"
          />
          
          <Text style={[styles.label, { color: theme.fg }]}>Icon</Text>
          <View style={styles.iconPicker}>
            {['📦', '💧', '🔥', '🥛', '🍞', '🧴', '🧼', '✋', '🚌', '📱', '🎮', '☕'].map(icon => (
              <TouchableOpacity
                key={icon}
                style={[styles.iconBtn, editItemIcon === icon && { backgroundColor: theme.accent }]}
                onPress={() => { lightHaptic(); setEditItemIcon(icon); }}
              >
                <Text style={styles.iconText}>{icon}</Text>
              </TouchableOpacity>
            ))}
          </View>
          
          <View style={[styles.setCard, { backgroundColor: theme.card, marginTop: 12 }]}>
            <Text style={[styles.setLabel, { color: theme.fg }]}>Custom Amount Each Time</Text>
            <Switch
              value={newItemIsCustom}
              onValueChange={(val) => setNewItemIsCustom(val)}
              trackColor={{ false: theme.fgMuted, true: theme.accent }}
              thumbColor="#FFF"
            />
          </View>
          <Text style={{ color: theme.fgMuted, fontSize: 12, marginTop: 4, marginBottom: 12 }}>
            When enabled, you'll enter amount each time you add this item
          </Text>
          
          <TouchableOpacity style={[styles.btn, { backgroundColor: theme.accent, marginTop: 20 }]} onPress={addNewItem}>
            <Text style={styles.btnText}>Add Item</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (mode === 'settings') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <StatusBar barStyle={settings.theme === 'dark' ? 'light-content' : 'dark-content'} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setMode('main')}>
            <Text style={[styles.backBtn, { color: theme.accent }]}>← Back</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.fg }]}>Settings</Text>
          <View style={{ width: 60 }} />
        </View>
        
        <ScrollView style={styles.content}>
          <Text style={[styles.sectionTitle, { color: theme.fg }]}>Appearance</Text>
          <View style={[styles.setCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.setLabel, { color: theme.fg }]}>Dark Mode</Text>
            <Switch
              value={settings.theme === 'dark'}
              onValueChange={(val) => setSettings(s => ({ ...s, theme: val ? 'dark' : 'light' }))}
              trackColor={{ false: theme.fgMuted, true: theme.accent }}
              thumbColor="#FFF"
            />
          </View>
          
          <Text style={[styles.sectionTitle, { color: theme.fg }]}>Currency</Text>
          <View style={styles.chipRow}>
            {CURRENCIES.map(c => (
              <TouchableOpacity
                key={c.code}
                style={[styles.chip, settings.currency === c.code && { backgroundColor: theme.accent }]}
                onPress={() => { lightHaptic(); setSettings(s => ({ ...s, currency: c.code })); }}
              >
                <Text style={[styles.chipText, { color: settings.currency === c.code ? '#FFF' : theme.fg }]}>{c.symbol} {c.code}</Text>
              </TouchableOpacity>
            ))}
          </View>
          
          <Text style={[styles.sectionTitle, { color: theme.fg }]}>Security</Text>
          <View style={[styles.setCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.setLabel, { color: theme.fg }]}>Lock Screen</Text>
            <Switch
              value={settings.lockEnabled}
              onValueChange={(val) => {
                if (val) {
                  Alert.prompt('Set Password', 'Enter a password to lock the app', (pwd) => {
                    if (pwd) setSettings(s => ({ ...s, lockEnabled: true, lockPassword: pwd }));
                  });
                } else {
                  setSettings(s => ({ ...s, lockEnabled: false, lockPassword: '' }));
                }
              }}
              trackColor={{ false: theme.fgMuted, true: theme.accent }}
              thumbColor="#FFF"
            />
          </View>
          
          <Text style={[styles.sectionTitle, { color: theme.fg }]}>Data</Text>
          <TouchableOpacity style={[styles.setCard, { backgroundColor: theme.card }]} onPress={() => setShowReportModal(true)}>
            <Text style={[styles.setLabel, { color: theme.fg }]}>📊 Export / Report</Text>
          </TouchableOpacity>
          
          <Text style={[styles.sectionTitle, { color: theme.fg }]}>Manage Items</Text>
          {items.map(item => (
            <View key={item.id} style={[styles.setCard, { backgroundColor: theme.card }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <Text style={{ fontSize: 20, marginRight: 10 }}>{item.icon}</Text>
                <View>
                  <Text style={[styles.setLabel, { color: theme.fg }]}>{item.name}</Text>
                  <Text style={[styles.setLabelSmall, { color: theme.fgMuted }]}>{currencySymbol}{item.price}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => openItemEditor(item)}>
                <Text style={{ color: theme.accent, fontSize: 14 }}>Edit Price</Text>
              </TouchableOpacity>
            </View>
          ))}
          
          <TouchableOpacity style={[styles.btn, { backgroundColor: theme.cardAlt, marginTop: 10 }]} onPress={() => setMode('addItem')}>
            <Text style={[styles.btnText, { color: theme.fg }]}>+ Add New Item</Text>
          </TouchableOpacity>
        </ScrollView>
        
        {/* Price Editor Modal */}
        <Modal visible={showItemEditor} transparent animationType="slide">
          <Pressable style={styles.overlay} onPress={() => setShowItemEditor(false)}>
            <Pressable style={[styles.modal, { backgroundColor: theme.card }]} onPress={e => e.stopPropagation()}>
              <Text style={[styles.modalTitle, { color: theme.fg }]}>Edit Price</Text>
              {editingItem && (
                <>
                  <Text style={{ color: theme.fgMuted, marginBottom: 15 }}>{editingItem.icon} {editingItem.name}</Text>
                  <Text style={[styles.label, { color: theme.fg }]}>New Price ({settings.currency})</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.cardAlt, color: theme.fg }]}
                    value={newItemPrice}
                    onChangeText={setNewItemPrice}
                    keyboardType="decimal-pad"
                  />
                  <Text style={[styles.label, { color: theme.fg }]}>Effective From</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.cardAlt, color: theme.fg }]}
                    value={priceChangeDate}
                    onChangeText={setPriceChangeDate}
                    placeholder="YYYY-MM-DD"
                  />
                  <Text style={{ color: theme.fgMuted, fontSize: 12, marginBottom: 15 }}>
                    Entries before this date keep old price
                  </Text>
                  <TouchableOpacity style={[styles.btn, { backgroundColor: theme.accent }]} onPress={updateItemPrice}>
                    <Text style={styles.btnText}>Save Change</Text>
                  </TouchableOpacity>
                </>
              )}
            </Pressable>
          </Pressable>
        </Modal>
        
        {/* Report/Export Modal */}
        <Modal visible={showReportModal} transparent animationType="slide">
          <Pressable style={styles.overlay} onPress={() => setShowReportModal(false)}>
            <Pressable style={[styles.modal, { backgroundColor: theme.card }]} onPress={e => e.stopPropagation()}>
              <Text style={[styles.modalTitle, { color: theme.fg }]}>Report & Export</Text>
              <Text style={[styles.label, { color: theme.fg }]}>Quick Ranges</Text>
              <View style={styles.chipRow}>
                <TouchableOpacity style={styles.chip} onPress={() => { const d = new Date(); setReportStartDate(d.toISOString().split('T')[0]); setReportEndDate(d.toISOString().split('T')[0]); }}>
                  <Text style={{ color: theme.fg }}>Today</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.chip} onPress={() => { const d = new Date(); d.setDate(1); setReportStartDate(d.toISOString().split('T')[0]); setReportEndDate(new Date().toISOString().split('T')[0]); }}>
                  <Text style={{ color: theme.fg }}>This Month</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.chip} onPress={() => { const y = new Date().getFullYear(); setReportStartDate(`${y}-01-01`); setReportEndDate(`${y}-12-31`); }}>
                  <Text style={{ color: theme.fg }}>This Year</Text>
                </TouchableOpacity>
              </View>
              <Text style={[styles.label, { color: theme.fg }]}>Custom Range</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.cardAlt, color: theme.fg, flex: 1 }]}
                  placeholder="Start"
                  placeholderTextColor={theme.fgMuted}
                  value={reportStartDate}
                  onChangeText={setReportStartDate}
                />
                <TextInput
                  style={[styles.input, { backgroundColor: theme.cardAlt, color: theme.fg, flex: 1 }]}
                  placeholder="End"
                  placeholderTextColor={theme.fgMuted}
                  value={reportEndDate}
                  onChangeText={setReportEndDate}
                />
              </View>
              {reportData.length > 0 && (
                <View style={[styles.reportBox, { backgroundColor: theme.cardAlt }]}>
                  {reportData.map(r => (
                    <View key={r.item.id} style={styles.reportRow}>
                      <Text style={{ color: theme.fg }}>{r.item.icon} {r.item.name}</Text>
                      <Text style={{ color: theme.fgMuted }}>{r.count}x</Text>
                      <Text style={{ color: theme.accent }}>{currencySymbol}{r.total.toFixed(2)}</Text>
                    </View>
                  ))}
                  <View style={[styles.divider, { backgroundColor: theme.fgMuted }]} />
                  <View style={styles.reportRow}>
                    <Text style={{ color: theme.fg, fontWeight: 'bold' }}>Total</Text>
                    <Text style={{ color: theme.fgMuted }}>{reportData.reduce((s, r) => s + r.count, 0)} items</Text>
                    <Text style={{ color: theme.accent, fontWeight: 'bold' }}>{currencySymbol}{reportData.reduce((s, r) => s + r.total, 0).toFixed(2)}</Text>
                  </View>
                </View>
              )}
              <TouchableOpacity style={[styles.btn, { backgroundColor: theme.accent }]} onPress={handleExport}>
                <Text style={styles.btnText}>Export CSV</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    );
  }

  // Report Modal (accessible from both main and settings)
  const ReportModal = (
    <Modal visible={showReportModal} transparent animationType="slide">
      <Pressable style={styles.overlay} onPress={() => setShowReportModal(false)}>
        <Pressable style={[styles.modal, { backgroundColor: theme.card }]} onPress={e => e.stopPropagation()}>
          <Text style={[styles.modalTitle, { color: theme.fg }]}>Report & Export</Text>
          <Text style={[styles.label, { color: theme.fg }]}>Quick Ranges</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity style={styles.chip} onPress={() => { const d = new Date(); setReportStartDate(d.toISOString().split('T')[0]); setReportEndDate(d.toISOString().split('T')[0]); }}>
              <Text style={{ color: theme.fg }}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.chip} onPress={() => { const d = new Date(); d.setDate(1); setReportStartDate(d.toISOString().split('T')[0]); setReportEndDate(new Date().toISOString().split('T')[0]); }}>
              <Text style={{ color: theme.fg }}>This Month</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.chip} onPress={() => { const y = new Date().getFullYear(); setReportStartDate(`${y}-01-01`); setReportEndDate(`${y}-12-31`); }}>
              <Text style={{ color: theme.fg }}>This Year</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.label, { color: theme.fg }]}>Custom Range</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput
              style={[styles.input, { backgroundColor: theme.cardAlt, color: theme.fg, flex: 1 }]}
              placeholder="Start"
              placeholderTextColor={theme.fgMuted}
              value={reportStartDate}
              onChangeText={setReportStartDate}
            />
            <TextInput
              style={[styles.input, { backgroundColor: theme.cardAlt, color: theme.fg, flex: 1 }]}
              placeholder="End"
              placeholderTextColor={theme.fgMuted}
              value={reportEndDate}
              onChangeText={setReportEndDate}
            />
          </View>
          {reportData.length > 0 && (
            <View style={[styles.reportBox, { backgroundColor: theme.cardAlt }]}>
              {reportData.map(r => (
                <View key={r.item.id} style={styles.reportRow}>
                  <Text style={{ color: theme.fg }}>{r.item.icon} {r.item.name}</Text>
                  <Text style={{ color: theme.fgMuted }}>{r.count}x</Text>
                  <Text style={{ color: theme.accent }}>{currencySymbol}{r.total.toFixed(2)}</Text>
                </View>
              ))}
              <View style={[styles.divider, { backgroundColor: theme.fgMuted }]} />
              <View style={styles.reportRow}>
                <Text style={{ color: theme.fg, fontWeight: 'bold' }}>Total</Text>
                <Text style={{ color: theme.fgMuted }}>{reportData.reduce((s, r) => s + r.count, 0)} items</Text>
                <Text style={{ color: theme.accent, fontWeight: 'bold' }}>{currencySymbol}{reportData.reduce((s, r) => s + r.total, 0).toFixed(2)}</Text>
              </View>
            </View>
          )}
          <TouchableOpacity style={[styles.btn, { backgroundColor: theme.accent }]} onPress={handleExport}>
            <Text style={styles.btnText}>Export CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, { backgroundColor: theme.cardAlt, marginTop: 8 }]} onPress={() => setShowReportModal(false)}>
            <Text style={[styles.btnText, { color: theme.fg }]}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );

  // Main Dashboard
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <StatusBar barStyle={settings.theme === 'dark' ? 'light-content' : 'dark-content'} />
      
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: theme.fg }]}>BoGa</Text>
          <Text style={[styles.subtitle, { color: theme.accent }]}>Expense Tracker</Text>
        </View>
        <TouchableOpacity onPress={() => { lightHaptic(); setMode('settings'); }}>
          <Text style={{ fontSize: 24 }}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* Month Year Filter */}
      <View style={styles.filterRow}>
        <TouchableOpacity style={[styles.filterBtn, { backgroundColor: theme.card }]} onPress={() => {
          lightHaptic();
          setSelectedMonth(m => m === 0 ? 11 : m - 1);
          if (selectedMonth === 0) setSelectedYear(y => y - 1);
        }}>
          <Text style={{ color: theme.fg }}>◀</Text>
        </TouchableOpacity>
        <View style={[styles.filterDisplay, { backgroundColor: theme.card }]}>
          <Text style={[styles.filterText, { color: theme.fg }]}>{MONTHS[selectedMonth]} {selectedYear}</Text>
        </View>
        <TouchableOpacity style={[styles.filterBtn, { backgroundColor: theme.card }]} onPress={() => {
          lightHaptic();
          setSelectedMonth(m => m === 11 ? 0 : m + 1);
          if (selectedMonth === 11) setSelectedYear(y => y + 1);
        }}>
          <Text style={{ color: theme.fg }}>▶</Text>
        </TouchableOpacity>
      </View>

      {/* Summary */}
      <View style={[styles.summaryCard, { backgroundColor: theme.card }]}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryLabel, { color: theme.fgMuted }]}>Unpaid</Text>
          <Text style={[styles.summaryValue, { color: theme.warning }]}>{currencySymbol}{unpaidCost.toFixed(2)}</Text>
          <Text style={[styles.summaryCount, { color: theme.fgMuted }]}>{unpaidCount} items</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: theme.border }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryLabel, { color: theme.fgMuted }]}>Paid</Text>
          <Text style={[styles.summaryValue, { color: theme.success }]}>{currencySymbol}{paidCost.toFixed(2)}</Text>
          <Text style={[styles.summaryCount, { color: theme.fgMuted }]}>{filteredEntries.filter(e => e.paid).length} items</Text>
        </View>
      </View>

      {/* Item Buttons */}
      <Text style={[styles.sectionTitle, { color: theme.fg }]}>Tap to Add</Text>
      <View style={styles.itemsGrid}>
        {items.map(item => (
          <TouchableOpacity
            key={item.id}
            style={[styles.itemCard, { backgroundColor: theme.card }]}
            onPress={() => handleItemPress(item)}
          >
            <Text style={styles.itemIcon}>{item.icon}</Text>
            <Text style={[styles.itemName, { color: theme.fg }]}>{item.name}</Text>
            <Text style={[styles.itemPrice, { color: theme.accent }]}>
              {item.customPrice ? 'Tap to add' : `${currencySymbol}${getPriceAtTime(item, Date.now()).toFixed(2)}`}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.addCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}
          onPress={() => setMode('addItem')}
        >
          <Text style={{ fontSize: 24 }}>+</Text>
          <Text style={{ color: theme.fgMuted, fontSize: 12 }}>Add Item</Text>
        </TouchableOpacity>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: theme.card }]}
          onPressIn={() => setShowPayModal(true)}
        >
          <Text style={{ fontSize: 16 }}>💳</Text>
          <Text style={[styles.actionLabel, { color: theme.fg }]}>Pay</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: theme.card }]}
          onPressIn={() => setTimeout(() => setShowDeleteModal(true), 10)}
        >
          <Text style={{ fontSize: 16 }}>🗑️</Text>
          <Text style={[styles.actionLabel, { color: theme.fg }]}>Delete</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: theme.card }]}
          onPressIn={() => {
            console.log('Report button pressed, showReportModal:', showReportModal);
            setTimeout(() => {
              console.log('Setting showReportModal to true');
              setShowReportModal(true);
            }, 10);
          }}
        >
          <Text style={{ fontSize: 16 }}>📊</Text>
          <Text style={[styles.actionLabel, { color: theme.fg }]}>Report</Text>
        </TouchableOpacity>
      </View>

      {/* Entries List */}
      <Text style={[styles.sectionTitle, { color: theme.fg }]}>Recent Entries</Text>
      <View style={styles.entriesContainer}>
        <ScrollView style={styles.entriesList} showsVerticalScrollIndicator={true}>
          {filteredEntries.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 32 }}>📝</Text>
            <Text style={{ color: theme.fgMuted }}>No entries this month</Text>
          </View>
        ) : (
          filteredEntries.slice(0, 20).map(entry => {
            const item = items.find(i => i.id === entry.itemId);
            return (
              <TouchableOpacity
                key={entry.id}
                style={[styles.entryCard, { backgroundColor: theme.card, opacity: entry.paid ? 0.6 : 1 }]}
                onPress={() => togglePaid(entry.id)}
                onLongPress={() => deleteEntry(entry.id)}
              >
                <View style={styles.entryLeft}>
                  <Text style={styles.entryIcon}>{item?.icon}</Text>
                  <View>
                    <Text style={[styles.entryName, { color: theme.fg }]}>{item?.name} {entry.paid && '✅'}</Text>
                    <Text style={[styles.entryDate, { color: theme.fgMuted }]}>
                      {new Date(entry.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.entryPrice, { color: entry.paid ? theme.success : theme.warning }]}>
                  {currencySymbol}{entry.priceAtTime.toFixed(2)}
                </Text>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
      </View>

      {/* Pay Modal */}
      <Modal visible={showPayModal} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setShowPayModal(false)}>
          <Pressable style={[styles.modal, { backgroundColor: theme.card }]} onPress={e => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: theme.fg }]}>Select Items to Pay</Text>
            <ScrollView style={[styles.modalList, { backgroundColor: theme.cardAlt }]}>
              {filteredEntries.filter(e => !e.paid).map(entry => {
                const item = items.find(i => i.id === entry.itemId);
                const selected = selectedEntries.includes(entry.id);
                return (
                  <TouchableOpacity
                    key={entry.id}
                    style={[styles.modalItem, selected && { backgroundColor: theme.accent }]}
                    onPress={() => toggleSelectEntry(entry.id)}
                  >
                    <Text style={{ color: selected ? '#FFF' : theme.fg, marginRight: 10 }}>
                      {selected ? '☑️' : '⬜'}
                    </Text>
                    <Text style={{ color: selected ? '#FFF' : theme.fg, flex: 1 }}>{item?.icon} {item?.name}</Text>
                    <Text style={{ color: selected ? '#FFF' : theme.fgMuted }}>{currencySymbol}{entry.priceAtTime.toFixed(2)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={[styles.modalTotal, { backgroundColor: theme.cardAlt }]}>
              <Text style={{ color: theme.fg }}>Selected: {selectedEntries.length}</Text>
              <Text style={{ color: theme.accent, fontWeight: 'bold' }}>{currencySymbol}{getSelectedCost().toFixed(2)}</Text>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.cardAlt }]}
                onPress={() => { setShowPayModal(false); setSelectedEntries([]); }}
              >
                <Text style={{ color: theme.fg }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.accent, opacity: selectedEntries.length ? 1 : 0.5 }]}
                onPress={markSelectedPaid}
                disabled={!selectedEntries.length}
              >
                <Text style={{ color: '#FFF' }}>Mark Paid</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete Modal */}
      <Modal visible={showDeleteModal} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setShowDeleteModal(false)}>
          <Pressable style={[styles.modal, { backgroundColor: theme.card }]} onPress={e => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: theme.fg }]}>Delete Options</Text>
            <TouchableOpacity
              style={[styles.deleteOption, { backgroundColor: theme.cardAlt }]}
              onPress={() => {
                const unpaid = filteredEntries.filter(e => !e.paid);
                if (unpaid.length === 0) {
                  Alert.alert('No Unpaid', 'No unpaid entries to delete');
                  return;
                }
                setSelectedEntries(unpaid.map(e => e.id));
                setShowDeleteModal(false);
                setShowPayModal(true);
              }}
            >
              <Text style={{ fontSize: 20 }}>☑️</Text>
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={{ color: theme.fg, fontWeight: '600' }}>Select & Delete</Text>
                <Text style={{ color: theme.fgMuted, fontSize: 12 }}>Select specific unpaid items to delete</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.deleteOption, { backgroundColor: theme.destructive + '20' }]}
              onPress={deleteUnpaidAll}
            >
              <Text style={{ fontSize: 20 }}>🗑️</Text>
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={{ color: theme.destructive, fontWeight: '600' }}>Delete All Unpaid</Text>
                <Text style={{ color: theme.fgMuted, fontSize: 12 }}>Remove all unpaid entries for {MONTHS[selectedMonth]} {selectedYear}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: theme.cardAlt, marginTop: 10 }]}
              onPress={() => setShowDeleteModal(false)}
            >
              <Text style={{ color: theme.fg }}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Report Modal */}
      {ReportModal}

      {/* Custom Price Modal */}
      <Modal visible={showCustomPriceModal} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setShowCustomPriceModal(false)}>
          <Pressable style={[styles.modal, { backgroundColor: theme.card }]} onPress={e => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: theme.fg }]}>Add {customPriceItem?.name}</Text>
            <Text style={[styles.label, { color: theme.fg }]}>Amount ({settings.currency})</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.cardAlt, color: theme.fg }]}
              placeholder="Enter amount"
              placeholderTextColor={theme.fgMuted}
              value={customPriceAmount}
              onChangeText={setCustomPriceAmount}
              keyboardType="decimal-pad"
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.cardAlt }]}
                onPress={() => setShowCustomPriceModal(false)}
              >
                <Text style={{ color: theme.fg }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.accent }]}
                onPress={() => {
                  if (customPriceItem && customPriceAmount) {
                    addEntry(customPriceItem.id, parseFloat(customPriceAmount));
                    setShowCustomPriceModal(false);
                    setCustomPriceAmount('');
                  }
                }}
              >
                <Text style={{ color: '#FFF' }}>Add</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerScreen: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  content: { flex: 1, padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10 },
  backBtn: { fontSize: 16, fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 14, marginTop: -4 },
  logo: { fontSize: 48, marginBottom: 20 },
  input: { width: '100%', padding: 14, borderRadius: 10, fontSize: 15, borderWidth: 1, marginBottom: 12 },
  btn: { width: '100%', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  btnText: { fontSize: 15, fontWeight: '600', color: '#FFF' },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6, marginTop: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12, marginTop: 16 },
  setCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 10, marginBottom: 8 },
  setLabel: { fontSize: 14 },
  setLabelSmall: { fontSize: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#334155' },
  chipText: { fontSize: 13 },
  iconPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#334155' },
  iconText: { fontSize: 22 },
  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 12 },
  filterBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  filterDisplay: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8 },
  filterText: { fontSize: 16, fontWeight: '600' },
  summaryCard: { flexDirection: 'row', borderRadius: 12, padding: 16, marginHorizontal: 20, marginBottom: 16 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, marginHorizontal: 16 },
  summaryLabel: { fontSize: 12, marginBottom: 4 },
  summaryValue: { fontSize: 20, fontWeight: '700' },
  summaryCount: { fontSize: 11 },
  itemsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, gap: 10 },
  itemCard: { width: '47%', borderRadius: 14, padding: 16, alignItems: 'center' },
  itemIcon: { fontSize: 28, marginBottom: 6 },
  itemName: { fontSize: 13, fontWeight: '600' },
  itemPrice: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  addCard: { width: '47%', borderRadius: 14, padding: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed' },
  actionsRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginTop: 16 },
  actionBtn: { flex: 1, padding: 12, borderRadius: 10, alignItems: 'center' },
  actionLabel: { fontSize: 12, marginTop: 4 },
  entriesList: { flex: 1, paddingHorizontal: 20, maxHeight: 300 },
  entriesContainer: { height: 300, paddingHorizontal: 20 },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  entryCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, padding: 12, marginBottom: 6 },
  entryLeft: { flexDirection: 'row', alignItems: 'center' },
  entryIcon: { fontSize: 22, marginRight: 10 },
  entryName: { fontSize: 14, fontWeight: '600' },
  entryDate: { fontSize: 11, marginTop: 2 },
  entryPrice: { fontSize: 15, fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  modal: { borderRadius: 18, padding: 18, width: '100%', maxWidth: 340 },
  modalTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 14 },
  modalList: { maxHeight: 200, borderRadius: 10, padding: 8, marginBottom: 10 },
  modalItem: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 8, marginBottom: 4 },
  modalTotal: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderRadius: 10, marginBottom: 10 },
  modalButtons: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, padding: 12, borderRadius: 10, alignItems: 'center' },
  deleteOption: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 10, marginBottom: 8 },
  reportBox: { borderRadius: 10, padding: 12, marginBottom: 12 },
  reportRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  divider: { height: 1, marginVertical: 8 },
});