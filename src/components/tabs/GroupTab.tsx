import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'framer-motion';
import { HeartPulse, Plus, Send, X, AlertTriangle } from 'lucide-react';
import { db, type Member } from '@/lib/db';
import { useTranslation } from '@/lib/i18nContext';
import { timeAgo, nameToColor, getCurrentPosition, logActivity } from '@/lib/utils';
import { AppHeader } from '@/components/AppHeader';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const ROLES_EN = ['Leader', 'Member', 'Medic', 'Scout', 'Driver'] as const;

export const GroupTab: React.FC = () => {
  const { t, language } = useTranslation();
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [detailMember, setDetailMember] = useState<Member | null>(null);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<string>('Member');
  const [msgText, setMsgText] = useState('');
  const [msgPriority, setMsgPriority] = useState<'Normal' | 'Important' | 'SOS'>('Normal');
  const [checkedIn, setCheckedIn] = useState(false);

  const members = useLiveQuery(() => db.members.toArray());
  const messages = useLiveQuery(() => db.messages.orderBy('timestamp').reverse().toArray());
  const userName = useLiveQuery(() => db.settings.get('userName'));
  const dmsEnabled = useLiveQuery(() => db.settings.get('deadManSwitch'));
  const dmsInterval = useLiveQuery(() => db.settings.get('dmsInterval'));

  const roleLabels = t('roles').split(',');

  const memberStatus = (m: Member) => {
    if (!m.lastCheckIn) return 'bg-muted-foreground/50';
    const h = (Date.now() - m.lastCheckIn) / 3600000;
    if (h < 4) return 'bg-success';
    if (h < 12) return 'bg-warning';
    return 'bg-danger';
  };

  const handleCheckIn = async () => {
    const pos = await getCurrentPosition();
    const name = (userName?.value as string) || 'User';
    // Update own member record if exists
    const self = (members || []).find((m) => m.name === name);
    if (self?.id) {
      await db.members.update(self.id, { lastCheckIn: Date.now(), lastLat: pos.lat, lastLng: pos.lng });
    }
    await db.checkins.add({ memberId: self?.id || 0, timestamp: Date.now(), lat: pos.lat, lng: pos.lng });
    await logActivity('check_in', `${name} checked in safely`, `${name} s'est signalé en sécurité`);
    setCheckedIn(true);
    toast.success(t('check_in'));
    setTimeout(() => setCheckedIn(false), 2000);
  };

  const handleAddMember = async () => {
    if (!newName.trim()) return;
    await db.members.add({ name: newName, role: newRole as Member['role'], createdAt: Date.now() });
    await logActivity('member_added', `Member added: ${newName}`, `Membre ajouté : ${newName}`);
    setNewName('');
    setNewRole('Member');
    setAddMemberOpen(false);
  };

  const handleRemoveMember = async (m: Member) => {
    if (m.id) {
      await db.members.delete(m.id);
      await logActivity('member_removed', `Member removed: ${m.name}`, `Membre retiré : ${m.name}`);
    }
    setDetailMember(null);
  };

  const handleSendMessage = async () => {
    if (!msgText.trim()) return;
    const name = (userName?.value as string) || 'User';
    await db.messages.add({ senderName: name, text: msgText, priority: msgPriority, timestamp: Date.now() });
    await logActivity('message_sent', `${name} posted a message`, `${name} a publié un message`);
    setMsgText('');
    setMsgPriority('Normal');
  };

  const toggleDMS = async (enabled: boolean) => {
    await db.settings.put({ key: 'deadManSwitch', value: enabled });
  };

  // Sort messages: SOS first, then by time
  const sortedMessages = [...(messages || [])].sort((a, b) => {
    if (a.priority === 'SOS' && b.priority !== 'SOS') return -1;
    if (b.priority === 'SOS' && a.priority !== 'SOS') return 1;
    return b.timestamp - a.timestamp;
  });

  const priorityStyle = (p: string) => {
    if (p === 'SOS') return 'border-danger border-2 animate-pulse';
    if (p === 'Important') return 'border-warning border';
    return 'border-border border';
  };

  const priorityBadge = (p: string) => {
    if (p === 'SOS') return 'bg-danger/10 text-danger';
    if (p === 'Important') return 'bg-warning/10 text-warning';
    return 'bg-secondary text-muted-foreground';
  };

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6">
      <AppHeader title={t('nav_group')} />

      {/* Member avatars */}
      <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-none">
        {(members || []).map((m) => (
          <button
            key={m.id}
            onClick={() => setDetailMember(m)}
            className="flex flex-col items-center gap-1 shrink-0 min-w-[56px]"
          >
            <div className="relative">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold"
                style={{ backgroundColor: nameToColor(m.name), color: '#fff' }}
              >
                {m.name.charAt(0).toUpperCase()}
              </div>
              <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-card ${memberStatus(m)}`} />
            </div>
            <span className="text-[10px] text-muted-foreground truncate max-w-[56px]">{m.name}</span>
          </button>
        ))}
        <button
          onClick={() => setAddMemberOpen(true)}
          className="flex flex-col items-center gap-1 shrink-0 min-w-[56px]"
        >
          <div className="w-12 h-12 rounded-full border-2 border-dashed border-border flex items-center justify-center text-muted-foreground">
            <Plus size={20} />
          </div>
          <span className="text-[10px] text-muted-foreground">{t('add')}</span>
        </button>
      </div>

      {/* Check-in button */}
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={handleCheckIn}
        className="w-full bg-success/10 border-2 border-success/20 rounded-xl p-5 flex flex-col items-center gap-2 mb-4"
      >
        <motion.div
          animate={checkedIn ? { scale: [1, 1.3, 1] } : {}}
          transition={{ type: 'spring', stiffness: 300, damping: 10 }}
        >
          <HeartPulse size={36} className="text-success" />
        </motion.div>
        <span className="text-lg font-bold text-success">{t('check_in')}</span>
      </motion.button>

      {/* Dead Man's Switch */}
      <div className="bg-card border border-border rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-warning" />
            <div>
              <div className="text-sm font-medium text-foreground">{t('dead_mans_switch')}</div>
              <div className="text-xs text-muted-foreground">{t('dead_mans_switch_desc')}</div>
            </div>
          </div>
          <Switch checked={!!dmsEnabled?.value} onCheckedChange={toggleDMS} />
        </div>
        {dmsEnabled?.value && (
          <div className="mt-3">
            <Select
              value={String(dmsInterval?.value || 4)}
              onValueChange={(v) => db.settings.put({ key: 'dmsInterval', value: Number(v) })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2, 4, 6, 12, 24].map((h) => (
                  <SelectItem key={h} value={String(h)}>{h} {t('hours')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Message Board */}
      <h3 className="text-sm font-semibold text-foreground mb-2">{t('message_board')}</h3>
      <div className="space-y-2 mb-4">
        {sortedMessages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">{t('no_messages')}</p>
        ) : (
          sortedMessages.map((msg) => (
            <div key={msg.id} className={`bg-card rounded-xl p-3 ${priorityStyle(msg.priority)}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-foreground">{msg.senderName}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${priorityBadge(msg.priority)}`}>
                    {msg.priority === 'Normal' ? t('priority_normal') : msg.priority === 'Important' ? t('priority_important') : t('priority_sos')}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono-data">{timeAgo(msg.timestamp, language)}</span>
                </div>
              </div>
              <p className="text-sm text-foreground">{msg.text}</p>
            </div>
          ))
        )}
      </div>

      {/* Message Input */}
      <div className="flex gap-2 pb-6">
        <div className="flex-1 flex gap-2">
          <Textarea
            placeholder={t('write_message')}
            value={msgText}
            onChange={(e) => setMsgText(e.target.value)}
            rows={1}
            className="min-h-[44px] bg-card resize-none"
          />
        </div>
        <Select value={msgPriority} onValueChange={(v) => setMsgPriority(v as any)}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Normal">{t('priority_normal')}</SelectItem>
            <SelectItem value="Important">{t('priority_important')}</SelectItem>
            <SelectItem value="SOS">{t('priority_sos')}</SelectItem>
          </SelectContent>
        </Select>
        <Button size="icon" onClick={handleSendMessage} disabled={!msgText.trim()} className="min-w-[44px] min-h-[44px]">
          <Send size={18} />
        </Button>
      </div>

      {/* Add Member Sheet */}
      <Sheet open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader><SheetTitle>{t('add_member')}</SheetTitle></SheetHeader>
          <div className="space-y-4 py-4">
            <Input placeholder={t('name')} value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES_EN.map((r, i) => <SelectItem key={r} value={r}>{roleLabels[i] || r}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={handleAddMember} className="w-full">{t('save')}</Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Member Detail Sheet */}
      <Sheet open={!!detailMember} onOpenChange={(open) => { if (!open) setDetailMember(null); }}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          {detailMember && (
            <>
              <SheetHeader><SheetTitle>{t('member_detail')}</SheetTitle></SheetHeader>
              <div className="py-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold"
                    style={{ backgroundColor: nameToColor(detailMember.name), color: '#fff' }}
                  >
                    {detailMember.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">{detailMember.name}</div>
                    <div className="text-sm text-muted-foreground">{roleLabels[ROLES_EN.indexOf(detailMember.role)] || detailMember.role}</div>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  {t('last_check_in')}: {detailMember.lastCheckIn ? timeAgo(detailMember.lastCheckIn, language) : t('never')}
                </div>
                {detailMember.lastLat && (
                  <div className="text-xs text-muted-foreground font-mono-data">
                    {detailMember.lastLat.toFixed(4)}, {detailMember.lastLng?.toFixed(4)}
                  </div>
                )}
                <Button variant="destructive" onClick={() => handleRemoveMember(detailMember)} className="w-full">
                  {t('remove_member')}
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};
