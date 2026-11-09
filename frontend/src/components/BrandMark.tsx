import { ArrowUpRight } from 'lucide-react';

export function BrandMark({ light = false }: { light?: boolean }) {
  return <div className={`brand-mark ${light ? 'brand-mark-light' : ''}`}><span className="brand-icon"><ArrowUpRight size={17} strokeWidth={2.8} /></span><span>cap<span className="brand-accent">money</span></span></div>;
}
