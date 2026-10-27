import { useEffect, useState } from 'react';
import { useStudio } from '../lib/app-context';
import type { AdminCoinTopupsResponse } from '../lib/types';
import { formatDateTime, formatMoney } from '../lib/format';
import { EmptyState, ErrorState, Pager, StatusPill, TableSkeleton } from '../components/ui';

const PAGE = 25;
export function CoinTopupsScreen() {
  const { client } = useStudio();
  const [data,setData] = useState<AdminCoinTopupsResponse|null>(null);
  const [error,setError] = useState<string|null>(null);
  const [query,setQuery] = useState('');
  const [debounced,setDebounced] = useState('');
  const [status,setStatus] = useState('');
  const [skip,setSkip] = useState(0);
  const [refresh,setRefresh] = useState(0);
  useEffect(()=>{const timer=setTimeout(()=>{setDebounced(query.trim());setSkip(0);},300);return()=>clearTimeout(timer);},[query]);
  useEffect(()=>{
    let active=true; setData(null);setError(null);
    client.listCoinTopups({q:debounced||undefined,status:status||undefined,take:PAGE,skip})
      .then(result=>{if(active)setData(result);})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:'Could not load top-ups');});
    return()=>{active=false;};
  },[client,debounced,status,skip,refresh]);
  const reload=()=>setRefresh(n=>n+1);
  return <div>
    <p className="hint">Live coin payments, separate from movie tickets. Pending payments have not credited coins.</p>
    <div className="toolbar">
      <input className="input search" aria-label="Search coin top-ups" placeholder="Search buyer or payment reference…" value={query} onChange={e=>setQuery(e.target.value)}/>
      <select className="select" aria-label="Payment status" value={status} onChange={e=>{setStatus(e.target.value);setSkip(0);}}>
        {['','PAID','PENDING','FAILED','REFUNDED'].map(s=><option key={s} value={s}>{s||'All statuses'}</option>)}
      </select>
      <button className="btn btn-ghost" onClick={reload}>Refresh</button>
    </div>
    <div className="card">{error?<ErrorState message={error} onRetry={reload}/>:!data?<TableSkeleton rows={5} cols={7}/>:!data.items.length?<EmptyState icon="◉" title="No coin top-ups found"/>:<>
      <div className="table-wrap"><table className="data"><thead><tr><th>Buyer</th><th>Coins</th><th>Amount</th><th>Provider</th><th>Status</th><th>Payment reference</th><th>Date</th></tr></thead>
        <tbody>{data.items.map(p=><tr key={p.id} className="static">
          <td><strong>{p.userDisplayName??'—'}</strong><div className="muted">{p.userEmail}</div></td>
          <td>{p.coins.toLocaleString()}<div className="muted">{p.status==='PAID'?'Credited':p.status==='REFUNDED'?'Refunded':'Not credited'}</div></td>
          <td>{formatMoney(p.amountMinor,p.currency)}</td><td>{p.provider}</td><td><StatusPill status={p.status}/></td>
          <td><code style={{fontSize:11,overflowWrap:'anywhere'}}>{p.reference}</code></td><td className="muted">{formatDateTime(p.paidAt??p.createdAt)}</td>
        </tr>)}</tbody></table></div>
      <Pager total={data.total} skip={skip} take={PAGE} onPage={setSkip}/>
    </>}</div>
  </div>;
}
