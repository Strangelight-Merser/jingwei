import {useEffect,useState} from 'react';
import {validReaderSituation,type ReaderSituation} from '../../../../packages/contracts/reader-situation.ts';
const KEY='jingwei.reader.situation',CHANGED='jingwei:situation-changed';
export function readReaderSituation():ReaderSituation|null{
 const value:unknown=window.jingwei?window.jingwei.readSituation?.():JSON.parse(localStorage.getItem(KEY)??'null');
 if(value===null)return null;if(!validReaderSituation(value))throw new Error('situation_unavailable');return value;
}
export function writeReaderSituation(value:ReaderSituation|null){
 if(value!==null&&!validReaderSituation(value))throw new Error('invalid_situation');
 if(window.jingwei){if(!window.jingwei.writeSituation)throw new Error('situation_unavailable');window.jingwei.writeSituation(value);}else if(value)localStorage.setItem(KEY,JSON.stringify(value));else localStorage.removeItem(KEY);
 window.dispatchEvent(new Event(CHANGED));
}
export function useReaderSituation(){
 const[situation,setSituation]=useState<ReaderSituation|null>(null),[ready,setReady]=useState(false),[unavailable,setUnavailable]=useState(false);
 useEffect(()=>{const refresh=()=>{try{setSituation(readReaderSituation());setUnavailable(false);}catch{setUnavailable(true);}setReady(true);};refresh();window.addEventListener(CHANGED,refresh);window.addEventListener('storage',refresh);return()=>{window.removeEventListener(CHANGED,refresh);window.removeEventListener('storage',refresh);};},[]);
 return{situation,ready,unavailable};
}
