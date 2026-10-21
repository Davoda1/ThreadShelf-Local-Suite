/** Storage thresholds use decimal MB/GB; displayed values use binary units. */
export function formatStorageSize(bytes,{locale='en-GB',bytesLabel='Bytes',unavailableLabel='Unavailable'}={}){
 if(typeof bytes!=='number'||!Number.isFinite(bytes)||bytes<0)return unavailableLabel;
 const [unit,divisor]=bytes<10_000_000?['KiB',1024]:bytes<=2_000_000_000?['MiB',1024**2]:['GiB',1024**3];
 const exact=new Intl.NumberFormat(locale,{maximumFractionDigits:0}).format(bytes);
 const scaled=new Intl.NumberFormat(locale,{minimumFractionDigits:2,maximumFractionDigits:2}).format(bytes/divisor);
 return `${exact} ${bytesLabel} (${scaled}${unit})`;
}
