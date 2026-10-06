import {useEffect, useReducer, useRef, useState} from 'react';
import {HoldingsCheckup, SavedHoldings} from '../components/HoldingsCheckup.tsx';
import {blankDraft, checkHoldings, confirmRows, editName, EXPOSURE_LABELS, importReducer, initialImportState, parseHoldings, recognizeImages} from '../lib/holdings-client.ts';
import {HOLDINGS_CHANGED, readHoldings, writeHoldings} from '../lib/holdings-storage.ts';
import '../holdings.css';

export function meta() {return [{title: '我的持仓 · 经纬'}];}

export default function HoldingsPage() {
  const [state, dispatch] = useReducer(importReducer, initialImportState);
  const [desktopOcr, setDesktopOcr] = useState(false);
  const [mode, setMode] = useState<'images' | 'text'>('images');
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<{url: string; name: string}[]>([]);
  const [done, setDone] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [checking, setChecking] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [notice, setNotice] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const textInput = useRef<HTMLTextAreaElement>(null);
  const busy = state.phase === 'recognizing' || state.phase === 'saving' || clearing;
  const fail = (error: unknown) => dispatch({type: 'error', message: error instanceof Error ? error.message : '操作未完成，请重试。'});

  useEffect(() => {
    let active = true;
    setDesktopOcr(Boolean(window.jingwei?.recognizeImage));
    readHoldings().then(saved => {if (active) dispatch({type: 'loaded', saved});}).catch(error => {if (active) fail(error);});
    return () => {active = false;};
  }, []);
  useEffect(() => {
    const images = files.map(file => ({url: URL.createObjectURL(file), name: file.name}));
    setPreviews(images);
    return () => images.forEach(image => URL.revokeObjectURL(image.url));
  }, [files]);
  useEffect(() => {
    if (!state.saved || state.phase !== 'checkup' || state.checkup) return;
    let active = true;
    setChecking(true);
    checkHoldings(state.saved).then(checkup => {if (active) dispatch({type: 'checked', checkup});})
      .catch(error => {if (active) fail(error);}).finally(() => {if (active) setChecking(false);});
    return () => {active = false;};
  }, [state.saved, state.phase, state.checkup]);
  useEffect(() => {
    if (['empty', 'recognizing', 'checkup'].includes(state.phase)) setNotice('');
    if (state.phase !== 'loading') heading.current?.focus();
  }, [state.phase]);
  useEffect(() => {if (mode === 'text' && state.phase === 'empty') textInput.current?.focus();}, [mode, state.phase]);
  useEffect(() => {
    if (state.phase !== 'empty') return;
    function paste(event: ClipboardEvent) {
      const images = Array.from(event.clipboardData?.items ?? []).filter(item => item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => file !== null);
      if (!images.length) return;
      event.preventDefault(); void importFiles(images);
    }
    window.addEventListener('paste', paste);
    return () => window.removeEventListener('paste', paste);
  }, [state.phase]);

  async function importFiles(selected: File[]) {
    const images = selected.filter(file => file.type.startsWith('image/'));
    if (!images.length) {fail(new Error('请选择图片文件。')); return;}
    if (!window.jingwei?.recognizeImage) {setMode('text'); fail(new Error('截图识别需桌面版，请粘贴文字或手动添加。')); return;}
    setFiles(images); setDone(0); dispatch({type: 'begin'});
    try {
      const lines = await recognizeImages(images, window.jingwei, setDone);
      const result = await parseHoldings({images: lines});
      if (!result.rows.length) throw new Error('没有读到持仓，请换一张清晰截图，或粘贴文字。');
      dispatch({type: 'parsed', result});
    } catch (error) {fail(error);}
  }
  async function importText(event: React.FormEvent) {
    event.preventDefault(); setFiles([]); dispatch({type: 'begin'});
    try {
      const result = await parseHoldings({text});
      if (!result.rows.length) throw new Error('没有读到持仓，请核对名称和金额，或手动添加。');
      dispatch({type: 'parsed', result});
    } catch (error) {fail(error);}
  }
  function addRow() {
    const row = blankDraft(crypto.randomUUID());
    if (state.phase === 'empty') {setFiles([]); dispatch({type: 'parsed', result: {rows: [], unread: []}}); dispatch({type: 'edit', drafts: [row]});}
    else dispatch({type: 'edit', drafts: [...state.drafts, row]});
    requestAnimationFrame(() => document.getElementById(`name-${row.row.id}`)?.focus());
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setNotice(''); dispatch({type: 'saving'});
    try {
      const rows = await confirmRows(state.drafts);
      if (state.drafts.some(draft => draft.rematch)) {
        dispatch({type: 'parsed', result: {rows, unread: state.unread}});
        setNotice('名称匹配已更新，请核对基金和方向后确认并保存。');
        return;
      }
      const saved = {rows, saved_at: new Date().toISOString()};
      await writeHoldings(saved);
      window.dispatchEvent(new Event(HOLDINGS_CHANGED));
      dispatch({type: 'saved', saved}); setFiles([]); setText('');
    } catch (error) {fail(error);}
  }
  async function clear() {
    setClearing(true);
    try {await writeHoldings(null); window.dispatchEvent(new Event(HOLDINGS_CHANGED)); dispatch({type: 'cleared'}); setText(''); setFiles([]);}
    catch (error) {fail(error);}
    finally {setClearing(false);}
  }
  async function retryCheckup() {
    if (!state.saved) return;
    setChecking(true);
    try {dispatch({type: 'checked', checkup: await checkHoldings(state.saved)});} catch (error) {fail(error);}
    finally {setChecking(false);}
  }

  return <main id="main" className="holdings-page">
    <header className="holdings-heading"><div><h1 ref={heading} tabIndex={-1}>我的持仓</h1><p>看清持仓方向、重复配置，以及当前规则能覆盖的部分。</p></div>
      {state.phase === 'checkup' && <div className="holdings-actions"><button type="button" className="holdings-secondary" onClick={() => {dispatch({type: 'reimport'}); setMode('images');}} disabled={busy}>重新导入</button><button type="button" className="holdings-text-button" onClick={clear} disabled={busy}>{clearing ? '清除中…' : '清除持仓'}</button></div>}
    </header>
    {state.error && <p className="holdings-error" role="alert">{state.error}</p>}
    {state.phase === 'loading' && <p role="status" className="holdings-muted">读取本机持仓中…</p>}
    {state.phase === 'empty' && <section className="holdings-import" aria-label="导入持仓">
      <div className={`holdings-drop${dragging ? ' is-dragging' : ''}`} onDragOver={event => {event.preventDefault(); setDragging(true);}} onDragLeave={event => {if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);}} onDrop={event => {event.preventDefault(); setDragging(false); void importFiles(Array.from(event.dataTransfer.files));}}>
        <img className="holdings-drop-art" src="/images/holdings-empty.webp" width={480} height={240} alt="" aria-hidden="true"/>
        <button type="button" className="holdings-drop-title" onClick={() => desktopOcr ? input.current?.click() : setMode('text')}>拖入、选择或粘贴持仓截图</button>
        <p>截图在本机识别，不上传</p>
        <small>{desktopOcr ? '支持多张截图，也可用 Cmd / Ctrl + V 粘贴图片' : '截图识别需桌面版；在浏览器里可粘贴文字或手动添加。'}</small>
        <input ref={input} className="holdings-file" type="file" accept="image/*" multiple tabIndex={-1} aria-label="选择持仓截图" onChange={event => {void importFiles(Array.from(event.target.files ?? [])); event.target.value = '';}}/>
      </div>
      <div className="holdings-import-options"><button type="button" className="holdings-secondary" onClick={() => {setMode('text'); textInput.current?.focus();}}>粘贴文字</button><button type="button" className="holdings-secondary" onClick={addRow}>手动添加</button>{state.saved && <button type="button" className="holdings-text-button" onClick={() => dispatch({type: 'cancel'})}>返回已保存的体检</button>}</div>
      {mode === 'text' && <form className="holdings-card holdings-text-import" onSubmit={importText}><label htmlFor="holdings-text">粘贴持仓名称与金额</label><p>每只持仓一行，金额单位为元。</p><textarea ref={textInput} id="holdings-text" value={text} onChange={event => setText(event.target.value)} rows={6} required/><button className="holdings-primary" type="submit" disabled={!text.trim()}>识别文字</button></form>}
    </section>}

    {state.phase === 'recognizing' && <section className="holdings-card holdings-progress" aria-live="polite" aria-busy="true">
      <h2>{files.length ? done < files.length ? `本机识别 ${done + 1} / ${files.length}` : '截图已识别，正在整理持仓' : '正在整理持仓文字'}</h2>
      {files.length > 0 && <><ul className="holdings-previews">{previews.map((image, i) => <li key={image.url}><img src={image.url} alt={`持仓截图 ${i + 1}`}/><span>{i < done ? '已识别' : i === done ? '识别中' : '等待识别'}</span></li>)}</ul><progress value={done} max={files.length} aria-label="已完成本机识别的截图数"/></>}
      <p className="holdings-muted">识别完成后，请核对名称和金额再保存。</p>
    </section>}

    {(state.phase === 'confirm' || state.phase === 'saving') && <form className="holdings-card holdings-confirm" onSubmit={save}>
      <div className="holdings-section-heading"><h2>确认持仓</h2><p>核对后才保存到本机。</p></div>
      {notice && <p className="holdings-muted holdings-match-notice" role="status">{notice}</p>}
      {state.unread.length > 0 && <details className="holdings-unread"><summary>{state.unread.length} 行未读为持仓，点开核对</summary><ul>{state.unread.map((line, i) => <li key={i}>{line}</li>)}</ul></details>}
      <fieldset disabled={busy}><legend className="holdings-sr-only">修改持仓名称和金额</legend>
        <div className="holdings-table" role="table" aria-label="待确认持仓"><div className="holdings-table-head" role="row"><span role="columnheader">名称 / 匹配基金</span><span role="columnheader">金额（元）</span><span role="columnheader">方向</span><span role="columnheader">操作</span></div>
          {state.drafts.map((draft, i) => <div className="holdings-row" role="row" key={draft.row.id}>
            <div className="holdings-name" role="cell"><label className="holdings-sr-only" htmlFor={`name-${draft.row.id}`}>第 {i + 1} 只持仓名称</label><input id={`name-${draft.row.id}`} value={draft.row.input_name} required onChange={event => dispatch({type: 'edit', drafts: state.drafts.map((item, n) => n === i ? editName(item, event.target.value) : item)})}/><small>{draft.rematch ? '名称待匹配 · 保存时核对' : draft.row.fund ? `${draft.row.fund.name} · ${draft.row.fund.code} · ${draft.row.fund.type}` : '未匹配'}</small></div>
            <div role="cell" className="holdings-amount"><label htmlFor={`amount-${draft.row.id}`}>金额（元）</label><input id={`amount-${draft.row.id}`} type="number" min="0" step="0.01" inputMode="decimal" value={draft.amount} required onChange={event => dispatch({type: 'edit', drafts: state.drafts.map((item, n) => n === i ? {...item, amount: event.target.value} : item)})}/></div>
            <div role="cell"><span className="holdings-exposure-tag">{EXPOSURE_LABELS[draft.row.exposure]}</span></div>
            <div role="cell"><button className="holdings-text-button" type="button" aria-label={`删除第 ${i + 1} 只持仓${draft.row.input_name ? `：${draft.row.input_name}` : ''}`} onClick={() => dispatch({type: 'edit', drafts: state.drafts.filter((_, n) => n !== i)})}>删除</button></div>
          </div>)}
        </div>
        <button className="holdings-text-button holdings-add" type="button" onClick={addRow}>＋ 添加一只</button>
      </fieldset>
      <div className="holdings-confirm-actions"><button className="holdings-primary" type="submit" disabled={busy || !state.drafts.length}>{state.phase === 'saving' ? '核对并保存中…' : state.drafts.some(draft => draft.rematch) ? '匹配名称并核对' : '确认并保存'}</button><button className="holdings-text-button" type="button" disabled={busy} onClick={() => {dispatch({type: 'cancel'}); setFiles([]); setNotice('');}}>取消</button></div>
    </form>}

    {state.phase === 'checkup' && state.saved && <>{state.checkup ? <HoldingsCheckup holdings={state.saved} checkup={state.checkup}/> : <section className="holdings-card"><h2>持仓已保存在本机</h2>{checking ? <p className="holdings-muted" role="status">正在体检…</p> : <><p className="holdings-muted">体检尚未完成，持仓清单已保留。</p><button className="holdings-secondary" type="button" onClick={retryCheckup}>重新体检</button></>}<SavedHoldings holdings={state.saved}/></section>}</>}
  </main>;
}
