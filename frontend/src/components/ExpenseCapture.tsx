import { useState } from 'react';
import { CameraView } from './CameraView';
import { ExpenseForm } from './ExpenseForm';

export function ExpenseCapture({ selectedDate, initialType = 'expense', onClose, onSaved }: { selectedDate: string; initialType?: 'expense' | 'income'; onClose: () => void; onSaved: () => void }) {
  const [step, setStep] = useState<'camera' | 'form'>('camera'); const [image, setImage] = useState<File | null>(null);
  if (step === 'camera') return <div className="capture-overlay"><CameraView onCaptured={file => { setImage(file); setStep('form'); }} onSelected={file => { setImage(file); setStep('form'); }} onManual={() => setStep('form')} onClose={onClose} /></div>;
  return <div className="capture-overlay"><ExpenseForm selectedDate={selectedDate} initialType={initialType} image={image} onCancel={() => setStep('camera')} onSaved={onSaved} /></div>;
}
