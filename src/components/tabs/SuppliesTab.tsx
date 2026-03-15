import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Skull, ChevronDown, ChevronUp, Trash2, Edit2 } from 'lucide-react';
import { db, type Supply } from '@/lib/db';
import { useTranslation } from '@/lib/i18nContext';
import { daysUntilExpiry, logActivity } from '@/lib/utils';
import { AppHeader } from '@/components/AppHeader';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const CATEGORIES_EN = ['Food', 'Water', 'Medical', 'Equipment', 'Documents', 'Hygiene', 'Communication', 'Other'];

export const SuppliesTab: React.FC = () => {
  const { t, language } = useTranslation();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editItem, setEditItem] = useState<Supply | null>(null);
  const [form, setForm] = useState({ name: '', category: 'Food', quantity: 1, unit: 'units', expirationDate: '', notes: '' });

  const supplies = useLiveQuery(() => db.supplies.orderBy('createdAt').reverse().toArray());

  const catLabels = t('supply_categories').split(',');
  const unitLabels = t('units').split(',');
  const categories = CATEGORIES_EN.map((c, i) => ({ value: c, label: catLabels[i] || c }));
  const units = ['kg', 'L', 'units', 'packs', 'cans', 'bottles', 'boxes'].map((u, i) => ({ value: u, label: unitLabels[i] || u }));

  const filtered = (supplies || []).filter((s) => {
    if (filter !== 'All' && s.category !== filter) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const total = supplies?.length ?? 0;
  const expiringSoon = supplies?.filter((s) => { const d = daysUntilExpiry(s.expirationDate); return d !== null && d > 0 && d <= 7; }).length ?? 0;
  const expiredCount = supplies?.filter((s) => { const d = daysUntilExpiry(s.expirationDate); return d !== null && d <= 0; }).length ?? 0;

  const resetForm = () => setForm({ name: '', category: 'Food', quantity: 1, unit: 'units', expirationDate: '', notes: '' });

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const now = Date.now();
    if (editItem?.id) {
      await db.supplies.update(editItem.id, { ...form, updatedAt: now });
      await logActivity('supply_updated', `Supply updated: ${form.name}`, `Provision mise à jour : ${form.name}`);
    } else {
      await db.supplies.add({ ...form, createdAt: now, updatedAt: now });
      await logActivity('supply_added', `Supply added: ${form.name}`, `Provision ajoutée : ${form.name}`);
    }
    resetForm();
    setEditItem(null);
    setSheetOpen(false);
  };

  const handleDelete = async (s: Supply) => {
    if (s.id) {
      await db.supplies.delete(s.id);
      await logActivity('supply_deleted', `Supply deleted: ${s.name}`, `Provision supprimée : ${s.name}`);
    }
    setExpanded(null);
  };

  const handleEdit = (s: Supply) => {
    setEditItem(s);
    setForm({ name: s.name, category: s.category, quantity: s.quantity, unit: s.unit, expirationDate: s.expirationDate || '', notes: s.notes || '' });
    setSheetOpen(true);
  };

  const expiryDot = (dateStr?: string) => {
    const d = daysUntilExpiry(dateStr);
    if (d === null) return null;
    if (d <= 0) return <Skull size={14} className="text-danger" />;
    if (d <= 7) return <span className="w-2.5 h-2.5 rounded-full bg-danger inline-block" />;
    if (d <= 30) return <span className="w-2.5 h-2.5 rounded-full bg-warning inline-block" />;
    return <span className="w-2.5 h-2.5 rounded-full bg-success inline-block" />;
  };

  const expiryText = (dateStr?: string) => {
    const d = daysUntilExpiry(dateStr);
    if (d === null) return '';
    if (d <= 0) return t('expired_label');
    return `${t('expires_in')} ${d} ${t('days')}`;
  };

  const getCatLabel = (cat: string) => categories.find((c) => c.value === cat)?.label || cat;

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6">
      <AppHeader title={t('nav_supplies')} />

      {/* Summary bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="bg-card border border-border rounded-lg px-3 py-2 text-center flex-1">
          <div className="text-lg font-bold font-mono-data text-foreground">{total}</div>
          <div className="text-[10px] text-muted-foreground">{t('total_items')}</div>
        </div>
        <div className="bg-warning/10 border border-warning/20 rounded-lg px-3 py-2 text-center flex-1">
          <div className="text-lg font-bold font-mono-data text-warning">{expiringSoon}</div>
          <div className="text-[10px] text-warning">{t('expiring_soon')}</div>
        </div>
        <div className="bg-danger/10 border border-danger/20 rounded-lg px-3 py-2 text-center flex-1">
          <div className="text-lg font-bold font-mono-data text-danger">{expiredCount}</div>
          <div className="text-[10px] text-danger">{t('expired')}</div>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-card"
        />
      </div>

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-none">
        <button
          onClick={() => setFilter('All')}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filter === 'All' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
        >
          {t('all')}
        </button>
        {categories.map((c) => (
          <button
            key={c.value}
            onClick={() => setFilter(c.value)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filter === c.value ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Items list */}
      <div className="space-y-2 pb-6">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">{t('no_supplies')}</p>
        ) : (
          filtered.map((s) => (
            <motion.div layout key={s.id} className="bg-card border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === s.id! ? null : s.id!)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-foreground truncate">{s.name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground font-mono-data">{s.quantity} {units.find((u) => u.value === s.unit)?.label || s.unit}</span>
                    <span className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded">{getCatLabel(s.category)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {expiryDot(s.expirationDate)}
                  <span className="text-[10px] text-muted-foreground">{expiryText(s.expirationDate)}</span>
                  {expanded === s.id ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
                </div>
              </button>
              <AnimatePresence>
                {expanded === s.id && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: 'auto' }}
                    exit={{ height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-3 border-t border-border pt-3">
                      {s.notes && <p className="text-xs text-muted-foreground mb-3">{s.notes}</p>}
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleEdit(s)} className="flex-1 gap-1">
                          <Edit2 size={14} /> {t('edit')}
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDelete(s)} className="flex-1 gap-1">
                          <Trash2 size={14} /> {t('delete')}
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))
        )}
      </div>

      {/* FAB */}
      <Sheet open={sheetOpen} onOpenChange={(open) => { setSheetOpen(open); if (!open) { resetForm(); setEditItem(null); } }}>
        <SheetTrigger asChild>
          <button className="fixed bottom-20 right-4 md:bottom-6 md:right-6 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center justify-center z-40 hover:opacity-90 transition-opacity">
            <Plus size={24} />
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>{editItem ? t('edit') : t('add_item')}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <Input placeholder={t('name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <div className="flex items-center gap-1 flex-1">
                <Button size="sm" variant="outline" onClick={() => setForm({ ...form, quantity: Math.max(0, form.quantity - 1) })}>-</Button>
                <Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} className="text-center" />
                <Button size="sm" variant="outline" onClick={() => setForm({ ...form, quantity: form.quantity + 1 })}>+</Button>
              </div>
              <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {units.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Input type="date" value={form.expirationDate} onChange={(e) => setForm({ ...form, expirationDate: e.target.value })} />
            <Textarea placeholder={t('notes')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            <Button onClick={handleSave} className="w-full">{t('save')}</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};
