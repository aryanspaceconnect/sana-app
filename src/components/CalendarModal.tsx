import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Icon } from '@iconify/react';
import { UserProfile, CalendarEventItem } from '../types';
import { addCalendarEvent, subscribeCalendarEvents } from '../lib/firebase';

interface CalendarModalProps {
  userProfile: UserProfile | null;
  onOpenScan: () => void;
}

export const CalendarModal: React.FC<CalendarModalProps> = ({ userProfile, onOpenScan }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<number>(new Date().getDate());
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [newEventTitle, setNewEventTitle] = useState('');

  const daysOfWeek = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  // Subscribe to calendar events in Firestore
  useEffect(() => {
    if (!userProfile?.uid) return;
    const unsub = subscribeCalendarEvents(userProfile.uid, (data) => {
      setEvents(data);
    });
    return () => unsub();
  }, [userProfile?.uid]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Helper to generate calendar days for current month
  const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const getFirstDayOffset = (y: number, m: number) => {
    const day = new Date(y, m, 1).getDay(); // 0=Sun, 1=Mon...
    return day === 0 ? 6 : day - 1; // Convert to Mon=0
  };

  const totalDays = getDaysInMonth(year, month);
  const offset = getFirstDayOffset(year, month);
  const prevMonthTotal = getDaysInMonth(year, month - 1);

  const prevMonthDays = Array.from({ length: offset }, (_, i) => prevMonthTotal - offset + 1 + i);
  const currentMonthDays = Array.from({ length: totalDays }, (_, i) => i + 1);

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim() || !userProfile?.uid) return;

    const formattedMonth = String(month + 1).padStart(2, '0');
    const formattedDay = String(selectedDate).padStart(2, '0');
    const dateStr = `${year}-${formattedMonth}-${formattedDay}`;

    await addCalendarEvent(userProfile.uid, {
      title: newEventTitle.trim(),
      date: dateStr,
      category: 'routine'
    });

    setNewEventTitle('');
  };

  const selectedDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDate).padStart(2, '0')}`;
  const todaysEvents = events.filter(e => e.date === selectedDateStr);

  return (
    <div className="w-full h-full px-5 pt-2 pb-24 overflow-y-auto no-scrollbar space-y-5">
      {/* Top Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h2 className="text-[22px] font-bold text-[#121316] tracking-tight">
            {monthNames[month]} <span className="text-[#8e95a2] font-normal">{year}</span>
          </h2>
          <p className="text-[12px] text-[#787f8d]">Regimen Schedule & Scan History</p>
        </div>

        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
            className="p-2 rounded-xl bg-white border border-[#eaedf1] text-[#121316] hover:bg-[#f0f3f6] transition-colors cursor-pointer"
          >
            <Icon icon="solar:alt-arrow-left-linear" className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
            className="p-2 rounded-xl bg-white border border-[#eaedf1] text-[#121316] hover:bg-[#f0f3f6] transition-colors cursor-pointer"
          >
            <Icon icon="solar:alt-arrow-right-linear" className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Calendar Grid Card (Aesthetic styling matching reference image 3) */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="squircle-card p-5 shadow-lg border border-white/90 bg-white/95"
      >
        {/* Days of week header */}
        <div className="grid grid-cols-7 gap-1 text-center mb-3">
          {daysOfWeek.map((d, i) => (
            <span key={i} className="text-[13px] font-semibold text-[#8a919e]">
              {d}
            </span>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-1 text-center">
          {/* Previous Month Inactive Days */}
          {prevMonthDays.map((d, i) => (
            <div key={`prev-${i}`} className="p-2.5 text-[14px] text-[#cbd5e1] font-medium">
              {d}
            </div>
          ))}

          {/* Current Month Days */}
          {currentMonthDays.map((day) => {
            const isSelected = day === selectedDate;
            const isToday = day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();

            return (
              <button
                key={`curr-${day}`}
                onClick={() => setSelectedDate(day)}
                className={`relative py-2.5 rounded-2xl text-[14px] font-semibold transition-all cursor-pointer flex flex-col items-center justify-center ${
                  isSelected
                    ? 'bg-[#3b82f6] text-white shadow-md'
                    : isToday
                    ? 'bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe]'
                    : 'text-[#334155] hover:bg-[#f1f5f9]'
                }`}
              >
                <span>{day}</span>
                {/* Indicator dot if events exist */}
                {events.some(e => e.date === `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`) && (
                  <span className={`w-1 h-1 rounded-full mt-0.5 ${isSelected ? 'bg-white' : 'bg-[#2563eb]'}`} />
                )}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Scheduled Events & Regimen Logs for Selected Date */}
      <div className="squircle-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-[#121316]">
            Schedule for {monthNames[month]} {selectedDate}
          </h3>

          <button
            onClick={onOpenScan}
            className="px-3 py-1.5 rounded-xl bg-[#1a1c1e] text-white text-[12px] font-medium flex items-center space-x-1 hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Icon icon="solar:camera-minimalistic-bold" className="w-3.5 h-3.5" />
            <span>Scan Skin</span>
          </button>
        </div>

        {todaysEvents.length === 0 ? (
          <div className="p-4 rounded-2xl bg-[#f8f9fb] text-center border border-[#eaedf1]">
            <p className="text-[13px] text-[#787f8d]">No custom events added for this date.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {todaysEvents.map(evt => (
              <div key={evt.id} className="p-3.5 rounded-2xl bg-white border border-[#eaedf1] flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="w-2 h-2 rounded-full bg-[#2563eb]" />
                  <span className="text-[13.5px] font-medium text-[#121316]">{evt.title}</span>
                </div>
                <span className="text-[11px] font-medium text-[#64748b] capitalize">{evt.category}</span>
              </div>
            ))}
          </div>
        )}

        {/* Add Quick Event Form */}
        <form onSubmit={handleAddEvent} className="flex items-center space-x-2 pt-2">
          <input
            type="text"
            value={newEventTitle}
            onChange={(e) => setNewEventTitle(e.target.value)}
            placeholder="Add reminder or skin note..."
            className="flex-1 px-3.5 py-2.5 rounded-2xl bg-[#f8f9fb] border border-[#eaedf1] text-[13px] text-[#121316] focus:outline-none focus:border-[#3b82f6]"
          />
          <button
            type="submit"
            disabled={!newEventTitle.trim()}
            className="px-4 py-2.5 rounded-2xl bg-[#2563eb] text-white text-[13px] font-medium disabled:opacity-40 transition-opacity cursor-pointer"
          >
            Add
          </button>
        </form>
      </div>
    </div>
  );
};
