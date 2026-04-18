import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Modal, Pressable, TextInput, Switch, Alert, SafeAreaView, StatusBar, KeyboardAvoidingView, Platform } from 'react-native';
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

const theme = {
  bg: '#000000',
  card: 'rgba(255, 255, 255, 0.04)',
  cardBorder: 'rgba(255, 255, 255, 0.1)',
  cardAlt: 'rgba(255, 255, 255, 0.08)',
  accent: '#007AFF',
  fg: '#FFFFFF',
  fgMuted: 'rgba(255, 255, 255, 0.55)',
  destructive: '#FF3B30',
  success: '#34C759',
  warning: '#FF9500',
};

export default function App() {
  const [items, setItems] = useState<Item[]>(DEFAULT_ITEMS);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    currency: 'SAR',
    lockEnabled: false,
    lockPassword: '',
  });
  
  const [mode, setMode] = useState<'main' | 'settings' | 'addItem'>('main');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedEntries, setSelectedEntries] = useState<string[]>([]);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(!settings.lockEnabled);
  const [lockInput, setLockInput] = useState('');
  
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const itemsScrollRef = useRef<ScrollView>(null);
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
    triggerHaptic();
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, paid: !e.paid } : e));
  }, [triggerHaptic]);

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

  const AmountDisplay = ({ amount, color, dimmed = false }: { amount: number; color: string; dimmed?: boolean }) => (
    <View style={styles.amountRow}>
      <Text style={[styles.currencySymbol, { color, opacity: dimmed ? 0.4 : 0.8 }]}>{currencySymbol}</Text>
      <Text style={[styles.amountValue, { color, opacity: dimmed ? 0.4 : 1 }]}>{amount.toFixed(2)}</Text>
    </View>
  );

  if (settings.lockEnabled && !isUnlocked) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.lockScreen}>
          <Text style={styles.lockIcon}>🔒</Text>
          <Text style={styles.lockTitle}>BoGa</Text>
          <TextInput
            style={styles.lockInput}
            placeholder="Enter password"
            placeholderTextColor={theme.fgMuted}
            value={lockInput}
            onChangeText={setLockInput}
            secureTextEntry
          />
          <TouchableOpacity style={styles.lockBtn} onPress={() => {
            if (lockInput === settings.lockPassword) {
              triggerHaptic();
              setIsUnlocked(true);
            } else {
              Alert.alert('Error', 'Wrong password');
            }
            setLockInput('');
          }}>
            <Text style={styles.lockBtnText}>Unlock</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (mode === 'addItem') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setMode('main')}>
            <Text style={styles.backBtn}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Item</Text>
          <View style={{ width: 60 }} />
        </View>
        
        <KeyboardAvoidingView behavior="padding" style={styles.content}>
          <Text style={styles.label}>ITEM NAME</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Milk, Bread"
            placeholderTextColor={theme.fgMuted}
            value={newItemName}
            onChangeText={setNewItemName}
          />
          
          <Text style={styles.label}>DEFAULT PRICE ({settings.currency})</Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            placeholderTextColor={theme.fgMuted}
            value={newItemPrice}
            onChangeText={setNewItemPrice}
            keyboardType="decimal-pad"
          />
          
          <Text style={styles.label}>ICON</Text>
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
          
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Custom Amount Each Time</Text>
            <Switch
              value={newItemIsCustom}
              onValueChange={(val) => setNewItemIsCustom(val)}
              trackColor={{ false: theme.cardAlt, true: theme.accent }}
              thumbColor="#FFF"
            />
          </View>
          
          <TouchableOpacity style={styles.primaryBtn} onPress={addNewItem}>
            <Text style={styles.primaryBtnText}>Add Item</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (mode === 'settings') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setMode('main')}>
            <Text style={styles.backBtn}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={{ width: 60 }} />
        </View>
        
        <ScrollView style={styles.content}>
          <Text style={styles.sectionTitle}>CURRENCY</Text>
          <View style={styles.currencyRow}>
            {CURRENCIES.map(c => (
              <TouchableOpacity
                key={c.code}
                style={[styles.currencyChip, settings.currency === c.code && { backgroundColor: theme.accent }]}
                onPress={() => { lightHaptic(); setSettings(s => ({ ...s, currency: c.code })); }}
              >
                <Text style={[styles.currencyChipText, { color: settings.currency === c.code ? '#FFF' : theme.fg }]}>{c.symbol} {c.code}</Text>
              </TouchableOpacity>
            ))}
          </View>
          
          <Text style={styles.sectionTitle}>SECURITY</Text>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Lock Screen</Text>
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
              trackColor={{ false: theme.cardAlt, true: theme.accent }}
              thumbColor="#FFF"
            />
          </View>
          
          <Text style={styles.sectionTitle}>DATA</Text>
          <TouchableOpacity style={styles.card} onPress={() => setShowReportModal(true)}>
            <Text style={styles.cardLabel}>📊 Export / Report</Text>
          </TouchableOpacity>
          
          <Text style={styles.sectionTitle}>MANAGE ITEMS</Text>
          {items.map(item => (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.itemIcon}>{item.icon}</Text>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <AmountDisplay amount={item.price} color={theme.fgMuted} />
                </View>
              </View>
              <TouchableOpacity onPress={() => openItemEditor(item)}>
                <Text style={styles.editLink}>Edit</Text>
              </TouchableOpacity>
            </View>
          ))}
          
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setMode('addItem')}>
            <Text style={styles.secondaryBtnText}>+ Add New Item</Text>
          </TouchableOpacity>
        </ScrollView>
        
        <Modal visible={showItemEditor} transparent animationType="slide">
          <Pressable style={styles.overlay} onPress={() => setShowItemEditor(false)}>
            <Pressable style={styles.modal} onPress={e => e.stopPropagation()}>
              <Text style={styles.modalTitle}>Edit Price</Text>
              {editingItem && (
                <>
                  <Text style={styles.modalSubtitle}>{editingItem.icon} {editingItem.name}</Text>
                  <Text style={styles.label}>NEW PRICE ({settings.currency})</Text>
                  <TextInput
                    style={styles.input}
                    value={newItemPrice}
                    onChangeText={setNewItemPrice}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.label}>EFFECTIVE FROM</Text>
                  <TextInput
                    style={styles.input}
                    value={priceChangeDate}
                    onChangeText={setPriceChangeDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.fgMuted}
                  />
                  <Text style={styles.helperText}>Entries before this date keep old price</Text>
                  <TouchableOpacity style={styles.primaryBtn} onPress={updateItemPrice}>
                    <Text style={styles.primaryBtnText}>Save Change</Text>
                  </TouchableOpacity>
                </>
              )}
            </Pressable>
          </Pressable>
        </Modal>
        
        <Modal visible={showReportModal} transparent animationType="slide">
          <Pressable style={styles.overlay} onPress={() => setShowReportModal(false)}>
            <Pressable style={styles.modal} onPress={e => e.stopPropagation()}>
              <Text style={styles.modalTitle}>Report & Export</Text>
              <Text style={styles.label}>QUICK RANGES</Text>
              <View style={styles.quickRanges}>
                <TouchableOpacity style={styles.rangeChip} onPress={() => { const d = new Date(); setReportStartDate(d.toISOString().split('T')[0]); setReportEndDate(d.toISOString().split('T')[0]); }}>
                  <Text style={styles.rangeChipText}>Today</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.rangeChip} onPress={() => { const d = new Date(); d.setDate(1); setReportStartDate(d.toISOString().split('T')[0]); setReportEndDate(new Date().toISOString().split('T')[0]); }}>
                  <Text style={styles.rangeChipText}>This Month</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.rangeChip} onPress={() => { const y = new Date().getFullYear(); setReportStartDate(`${y}-01-01`); setReportEndDate(`${y}-12-31`); }}>
                  <Text style={styles.rangeChipText}>This Year</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.label}>CUSTOM RANGE</Text>
              <View style={styles.dateRange}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Start"
                  placeholderTextColor={theme.fgMuted}
                  value={reportStartDate}
                  onChangeText={setReportStartDate}
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="End"
                  placeholderTextColor={theme.fgMuted}
                  value={reportEndDate}
                  onChangeText={setReportEndDate}
                />
              </View>
              {reportData.length > 0 && (
                <View style={styles.reportBox}>
                  {reportData.map(r => (
                    <View key={r.item.id} style={styles.reportRow}>
                      <Text style={styles.reportItem}>{r.item.icon} {r.item.name}</Text>
                      <Text style={styles.reportCount}>{r.count}x</Text>
                      <AmountDisplay amount={r.total} color={theme.accent} />
                    </View>
                  ))}
                  <View style={styles.reportDivider} />
                  <View style={styles.reportRow}>
                    <Text style={styles.reportTotal}>Total</Text>
                    <Text style={styles.reportCount}>{reportData.reduce((s, r) => s + r.count, 0)} items</Text>
                    <AmountDisplay amount={reportData.reduce((s, r) => s + r.total, 0)} color={theme.accent} />
                  </View>
                </View>
              )}
              <TouchableOpacity style={styles.primaryBtn} onPress={handleExport}>
                <Text style={styles.primaryBtnText}>Export CSV</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.headerNavBtn} onPress={() => {
            lightHaptic();
            setSelectedMonth(m => m === 0 ? 11 : m - 1);
            if (selectedMonth === 0) setSelectedYear(y => y - 1);
          }}>
            <Text style={styles.headerNavText}>◀</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.headerCenter}>
          <Text style={styles.monthYear}>{MONTHS[selectedMonth]} {selectedYear}</Text>
        </View>
        
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerNavBtn} onPress={() => {
            lightHaptic();
            setSelectedMonth(m => m === 11 ? 0 : m + 1);
            if (selectedMonth === 11) setSelectedYear(y => y + 1);
          }}>
            <Text style={styles.headerNavText}>▶</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { lightHaptic(); setMode('settings'); }}>
            <Text style={styles.settingsIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.mainContent}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>UNPAID</Text>
            <AmountDisplay amount={unpaidCost} color={theme.warning} dimmed={unpaidCost === 0} />
            <Text style={styles.summaryCount}>{unpaidCount} items</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>PAID</Text>
            <AmountDisplay amount={paidCost} color={theme.success} dimmed={paidCost === 0} />
            <Text style={styles.summaryCount}>{filteredEntries.filter(e => e.paid).length} items</Text>
          </View>
        </View>

        <View style={styles.itemsRow}>
          <TouchableOpacity 
            style={styles.scrollArrowBtn} 
            onPress={() => itemsScrollRef.current?.scrollTo({ x: 0, animated: true })}
            activeOpacity={0.7}
          >
            <Text style={styles.scrollArrowText}>◀</Text>
          </TouchableOpacity>
          <ScrollView 
            ref={itemsScrollRef}
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.itemsScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {items.map(item => (
              <TouchableOpacity
                key={item.id}
                style={styles.itemCard}
                onPress={() => handleItemPress(item)}
                activeOpacity={0.7}
              >
                <Text style={styles.itemIcon}>{item.icon}</Text>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemPrice}>
                  {item.customPrice ? 'Tap to add' : (
                    <AmountDisplay amount={getPriceAtTime(item, Date.now())} color={theme.accent} />
                  )}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity
            style={styles.addCard}
            onPress={() => setMode('addItem')}
            activeOpacity={0.7}
          >
            <Text style={styles.addIcon}>+</Text>
            <Text style={styles.addText}>Add Item</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.scrollArrowBtn}
            onPress={() => itemsScrollRef.current?.scrollToEnd({ animated: true })}
            activeOpacity={0.7}
          >
            <Text style={styles.scrollArrowText}>▶</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setShowPayModal(true)} activeOpacity={0.7}>
            <Text style={styles.actionIcon}>💳</Text>
            <Text style={styles.actionLabel}>Pay</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setShowDeleteModal(true)} activeOpacity={0.7}>
            <Text style={styles.actionIcon}>🗑️</Text>
            <Text style={styles.actionLabel}>Delete</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setShowReportModal(true)} activeOpacity={0.7}>
            <Text style={styles.actionIcon}>📊</Text>
            <Text style={styles.actionLabel}>Report</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.entriesList} showsVerticalScrollIndicator={false}>
          {filteredEntries.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📝</Text>
              <Text style={styles.emptyText}>No entries this month</Text>
            </View>
          ) : (
            filteredEntries.slice(0, 20).map((entry, index) => {
              const item = items.find(i => i.id === entry.itemId);
              return (
                <TouchableOpacity
                  key={entry.id}
                  style={styles.entryItem}
                  onPress={() => togglePaid(entry.id)}
                  onLongPress={() => deleteEntry(entry.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.entryRow}>
                    <Text style={styles.entryIcon}>{item?.icon}</Text>
                    <View style={styles.entryInfo}>
                      <Text style={styles.entryName}>{item?.name}</Text>
                      <Text style={styles.entryDate}>
                        {new Date(entry.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    <AmountDisplay amount={entry.priceAtTime} color={entry.paid ? theme.success : theme.warning} />
                  </View>
                  {index < Math.min(filteredEntries.length, 20) - 1 && <View style={styles.separator} />}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>

      <Modal visible={showPayModal} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setShowPayModal(false)}>
          <Pressable style={styles.modal} onPress={e => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Select Items to Pay</Text>
            <ScrollView style={styles.modalList}>
              {filteredEntries.filter(e => !e.paid).map(entry => {
                const item = items.find(i => i.id === entry.itemId);
                const selected = selectedEntries.includes(entry.id);
                return (
                  <TouchableOpacity
                    key={entry.id}
                    style={[styles.modalItem, selected && { backgroundColor: theme.accent }]}
                    onPress={() => toggleSelectEntry(entry.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.checkmark}>{selected ? '☑️' : '⬜'}</Text>
                    <Text style={[styles.modalItemName, selected && styles.selectedText]}>{item?.icon} {item?.name}</Text>
                    <AmountDisplay amount={entry.priceAtTime} color={selected ? '#FFF' : theme.fgMuted} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={styles.modalTotal}>
              <Text style={styles.modalTotalText}>Selected: {selectedEntries.length}</Text>
              <AmountDisplay amount={getSelectedCost()} color={theme.accent} />
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => { setShowPayModal(false); setSelectedEntries([]); }}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.primaryBtn, { opacity: selectedEntries.length ? 1 : 0.5 }]} 
                onPress={markSelectedPaid}
                disabled={!selectedEntries.length}
              >
                <Text style={styles.primaryBtnText}>Mark Paid</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showDeleteModal} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setShowDeleteModal(false)}>
          <Pressable style={styles.modal} onPress={e => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Delete Options</Text>
            <TouchableOpacity
              style={styles.deleteOption}
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
              activeOpacity={0.7}
            >
              <Text style={styles.deleteIcon}>☑️</Text>
              <View style={styles.deleteInfo}>
                <Text style={styles.deleteTitle}>Select & Delete</Text>
                <Text style={styles.deleteSubtitle}>Select specific unpaid items to delete</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.deleteOption, { borderColor: theme.destructive }]}
              onPress={deleteUnpaidAll}
              activeOpacity={0.7}
            >
              <Text style={styles.deleteIcon}>🗑️</Text>
              <View style={styles.deleteInfo}>
                <Text style={[styles.deleteTitle, { color: theme.destructive }]}>Delete All Unpaid</Text>
                <Text style={styles.deleteSubtitle}>Remove all unpaid entries for {MONTHS[selectedMonth]} {selectedYear}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setShowDeleteModal(false)}>
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showReportModal} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setShowReportModal(false)}>
          <Pressable style={styles.modal} onPress={e => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Report & Export</Text>
            <Text style={styles.label}>QUICK RANGES</Text>
            <View style={styles.quickRanges}>
              <TouchableOpacity style={styles.rangeChip} onPress={() => { const d = new Date(); setReportStartDate(d.toISOString().split('T')[0]); setReportEndDate(d.toISOString().split('T')[0]); }}>
                <Text style={styles.rangeChipText}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rangeChip} onPress={() => { const d = new Date(); d.setDate(1); setReportStartDate(d.toISOString().split('T')[0]); setReportEndDate(new Date().toISOString().split('T')[0]); }}>
                <Text style={styles.rangeChipText}>This Month</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rangeChip} onPress={() => { const y = new Date().getFullYear(); setReportStartDate(`${y}-01-01`); setReportEndDate(`${y}-12-31`); }}>
                <Text style={styles.rangeChipText}>This Year</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.label}>CUSTOM RANGE</Text>
            <View style={styles.dateRange}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Start"
                placeholderTextColor={theme.fgMuted}
                value={reportStartDate}
                onChangeText={setReportStartDate}
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="End"
                placeholderTextColor={theme.fgMuted}
                value={reportEndDate}
                onChangeText={setReportEndDate}
              />
            </View>
            {reportData.length > 0 && (
              <View style={styles.reportBox}>
                {reportData.map(r => (
                  <View key={r.item.id} style={styles.reportRow}>
                    <Text style={styles.reportItem}>{r.item.icon} {r.item.name}</Text>
                    <Text style={styles.reportCount}>{r.count}x</Text>
                    <AmountDisplay amount={r.total} color={theme.accent} />
                  </View>
                ))}
                <View style={styles.reportDivider} />
                <View style={styles.reportRow}>
                  <Text style={styles.reportTotal}>Total</Text>
                  <Text style={styles.reportCount}>{reportData.reduce((s, r) => s + r.count, 0)} items</Text>
                  <AmountDisplay amount={reportData.reduce((s, r) => s + r.total, 0)} color={theme.accent} />
                </View>
              </View>
            )}
            <TouchableOpacity style={styles.primaryBtn} onPress={handleExport}>
              <Text style={styles.primaryBtnText}>Export CSV</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setShowReportModal(false)}>
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showCustomPriceModal} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setShowCustomPriceModal(false)}>
          <Pressable style={styles.modal} onPress={e => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Add {customPriceItem?.name}</Text>
            <Text style={styles.label}>AMOUNT ({settings.currency})</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter amount"
              placeholderTextColor={theme.fgMuted}
              value={customPriceAmount}
              onChangeText={setCustomPriceAmount}
              keyboardType="decimal-pad"
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setShowCustomPriceModal(false)}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => {
                if (customPriceItem && customPriceAmount) {
                  addEntry(customPriceItem.id, parseFloat(customPriceAmount));
                  setShowCustomPriceModal(false);
                  setCustomPriceAmount('');
                }
              }}>
                <Text style={styles.primaryBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: theme.bg,
    paddingHorizontal: 24,
  },
  content: { 
    flex: 1, 
    paddingHorizontal: 24,
  },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 12,
  },
  headerLeft: {
    width: 40,
    alignItems: 'flex-start',
  },
  headerNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.card,
    borderWidth: 0.5,
    borderColor: theme.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerNavText: {
    fontSize: 14,
    color: theme.fg,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerRight: {
    width: 80,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  monthYear: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.fg,
    letterSpacing: 0.37,
  },
  settingsIcon: {
    fontSize: 24,
    opacity: 0.7,
  },
  backBtn: { 
    fontSize: 17,
    color: theme.accent,
    fontWeight: '400',
  },
  headerTitle: { 
    fontSize: 17,
    fontWeight: '600',
    color: theme.fg,
  },
  filterRow: { 
    flexDirection: 'row', 
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 12,
  },
  navBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.card,
    borderWidth: 0.5,
    borderColor: theme.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnText: {
    fontSize: 18,
    color: theme.fg,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 0.5,
    backgroundColor: theme.cardBorder,
    marginHorizontal: 16,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.fgMuted,
    letterSpacing: 0.05,
    marginBottom: 8,
  },
  summaryCount: {
    fontSize: 13,
    color: theme.fgMuted,
    marginTop: 4,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  currencySymbol: {
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.8,
    marginRight: 2,
  },
  amountValue: {
    fontSize: 20,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.fgMuted,
    letterSpacing: 0.05,
    marginBottom: 12,
    marginTop: 8,
  },
  itemsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  itemIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.fg,
    marginBottom: 4,
  },
  itemPrice: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addCard: {
    width: 200,
    height: 220,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  addIcon: {
    fontSize: 36,
    color: theme.fgMuted,
    textShadowColor: 'rgba(255, 255, 255, 0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  addText: {
    fontSize: 13,
    color: theme.fgMuted,
    marginTop: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    marginBottom: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: theme.card,
    borderWidth: 0.5,
    borderColor: theme.cardBorder,
  },
  actionIcon: {
    fontSize: 16,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.fg,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 15,
    color: theme.fgMuted,
  },
  entryItem: {
    paddingVertical: 14,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  entryIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  entryInfo: {
    flex: 1,
  },
  entryName: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.fg,
  },
  entryDate: {
    fontSize: 13,
    color: theme.fgMuted,
    marginTop: 2,
  },
  separator: {
    height: 0.5,
    backgroundColor: theme.cardBorder,
    marginLeft: 48,
    marginTop: 14,
  },
  mainContent: {
    flex: 1,
    flexDirection: 'column',
  },
  summaryCard: {
    flex: 0.75,
    minHeight: 60,
    flexDirection: 'row',
    borderRadius: 16,
    backgroundColor: theme.card,
    borderWidth: 0.5,
    borderColor: theme.cardBorder,
    padding: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  itemsRow: {
    flex: 2,
    minHeight: 260,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  itemsScrollContent: {
    flexDirection: 'row',
    gap: 12,
  },
  scrollArrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.4,
    zIndex: 100,
  },
  scrollArrowText: {
    fontSize: 14,
    color: theme.fg,
  },
  itemCard: {
    width: 200,
    height: 220,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  entriesList: {
    flex: 8,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#121212',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.fg,
    textAlign: 'center',
    marginBottom: 20,
  },
  modalSubtitle: {
    fontSize: 15,
    color: theme.fgMuted,
    textAlign: 'center',
    marginBottom: 16,
  },
  modalList: {
    maxHeight: 240,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  checkmark: {
    fontSize: 16,
    marginRight: 10,
  },
  modalItemName: {
    flex: 1,
    fontSize: 15,
    color: theme.fg,
  },
  selectedText: {
    color: '#FFF',
  },
  modalTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    backgroundColor: theme.cardAlt,
    borderRadius: 10,
    marginBottom: 12,
  },
  modalTotalText: {
    fontSize: 15,
    color: theme.fg,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: theme.accent,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFF',
  },
  secondaryBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: theme.cardAlt,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.fg,
  },
  deleteOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: theme.cardAlt,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  deleteIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  deleteInfo: {
    flex: 1,
  },
  deleteTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.fg,
  },
  deleteSubtitle: {
    fontSize: 13,
    color: theme.fgMuted,
    marginTop: 2,
  },
  lockScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  lockIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  lockTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.fg,
    marginBottom: 32,
  },
  lockInput: {
    width: '100%',
    padding: 16,
    borderRadius: 12,
    backgroundColor: theme.card,
    borderWidth: 0.5,
    borderColor: theme.cardBorder,
    fontSize: 17,
    color: theme.fg,
    textAlign: 'center',
    marginBottom: 16,
  },
  lockBtn: {
    width: '100%',
    padding: 16,
    borderRadius: 12,
    backgroundColor: theme.accent,
    alignItems: 'center',
  },
  lockBtnText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFF',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.fgMuted,
    letterSpacing: 0.05,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    padding: 14,
    borderRadius: 10,
    backgroundColor: theme.cardAlt,
    fontSize: 17,
    color: theme.fg,
    borderWidth: 0.5,
    borderColor: theme.cardBorder,
  },
  iconPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: theme.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 24,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: theme.card,
    borderWidth: 0.5,
    borderColor: theme.cardBorder,
    marginTop: 16,
  },
  switchLabel: {
    fontSize: 15,
    color: theme.fg,
  },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: theme.card,
    borderWidth: 0.5,
    borderColor: theme.cardBorder,
    marginBottom: 8,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cardLabel: {
    fontSize: 15,
    color: theme.fg,
  },
  itemInfo: {
    flex: 1,
  },
  editLink: {
    fontSize: 15,
    color: theme.accent,
    fontWeight: '500',
  },
  currencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  currencyChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: theme.card,
  },
  currencyChipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  helperText: {
    fontSize: 12,
    color: theme.fgMuted,
    marginTop: 4,
    marginBottom: 16,
  },
  quickRanges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  rangeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: theme.cardAlt,
  },
  rangeChipText: {
    fontSize: 13,
    color: theme.fg,
  },
  dateRange: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  reportBox: {
    backgroundColor: theme.cardAlt,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  reportItem: {
    flex: 1,
    fontSize: 14,
    color: theme.fg,
  },
  reportCount: {
    fontSize: 13,
    color: theme.fgMuted,
    marginHorizontal: 12,
  },
  reportDivider: {
    height: 0.5,
    backgroundColor: theme.cardBorder,
    marginVertical: 8,
  },
  reportTotal: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: theme.fg,
  },
});
