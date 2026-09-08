const key="sayi-v1";
const englishDbName="sayi-english-v1";
const englishStoreName="books";
const emptyEnglishStudy=()=>({
	books:[],
	pendingImport:null,
	activeSession:null,
	dailyGoal:{minutes:30,completed:0,date:null},
	activity:[]
});
const emptySubjectState=()=>({lessons:{},items:{},dailyTasks:[],exams:[],reviewTasks:[]});
const seed={studyLog:[],subjects:[{id:"s1",name:"الرياضيات",color:"purple",chapters:[{id:"c1",name:"الفصل الأول: المشتقات",lessons:[{id:"l1",name:"مقدمة في المشتقات",done:true,today:true},{id:"l2",name:"قواعد الاشتقاق",done:false,today:true}]},{id:"c2",name:"الفصل الثاني: التكامل",lessons:[{id:"l3",name:"التكامل غير المحدد",done:false,today:false}]}]}],tasks:[],legacyTasks:[],englishStudy:emptyEnglishStudy(),subjectState:{}};
export const load=()=>{
	try{
		const value=JSON.parse(localStorage.getItem(key))||structuredClone(seed);
		value.subjectState ??= {};
		value.legacyTasks ??= [];
		return value;
	}catch{return structuredClone(seed)}
};
const openEnglishDb=()=>new Promise((resolve,reject)=>{
	if(!globalThis.indexedDB){reject(new Error("IndexedDB is not available"));return}
	const request=indexedDB.open(englishDbName,1);
	request.onupgradeneeded=()=>request.result.createObjectStore(englishStoreName,{keyPath:"id"});
	request.onsuccess=()=>resolve(request.result);
	request.onerror=()=>reject(request.error);
});
const putEnglishBooks=async (books,pendingImport=null)=>{
	const db=await openEnglishDb();
	await new Promise((resolve,reject)=>{
		const transaction=db.transaction(englishStoreName,"readwrite");
		transaction.objectStore(englishStoreName).put({id:"library",books,pendingImport});
		transaction.oncomplete=resolve;
		transaction.onerror=()=>reject(transaction.error);
	});
	db.close();
};
export const hydrateEnglish=async data=>{
	try{
		const db=await openEnglishDb();
		const record=await new Promise((resolve,reject)=>{
			const request=db.transaction(englishStoreName,"readonly").objectStore(englishStoreName).get("library");
			request.onsuccess=()=>resolve(request.result);
			request.onerror=()=>reject(request.error);
		});
		db.close();
		if(record?.books?.length || record?.pendingImport){
			data.englishStudy ??= emptyEnglishStudy();
			if(record.books?.length && !data.englishStudy.books?.length) data.englishStudy.books=record.books;
			if(!data.englishStudy.pendingImport) data.englishStudy.pendingImport=record.pendingImport||null;
		}
	}catch(error){console.warn("English IndexedDB is unavailable",error)}
	return data;
};
export const save=x=>{
	try{
		localStorage.setItem(key,JSON.stringify(x));
		globalThis.dispatchEvent?.(new CustomEvent("sayi-saved"));
		return true;
	}catch(error){
		try{
			const fallback=structuredClone(x);
			const books=fallback.englishStudy?.books||[];
			const pendingImport=fallback.englishStudy?.pendingImport||null;
			if(!books.length && !pendingImport) throw error;
			fallback.englishStudy.books=[];
			fallback.englishStudy.pendingImport=null;
			localStorage.setItem(key,JSON.stringify(fallback));
			globalThis.dispatchEvent?.(new CustomEvent("sayi-saved"));
			putEnglishBooks(books,pendingImport).catch(idbError=>globalThis.dispatchEvent?.(new CustomEvent("sayi-save-error",{detail:idbError})));
			return true;
		}catch(fallbackError){
			console.error("Sayi could not save data",fallbackError);
			globalThis.dispatchEvent?.(new CustomEvent("sayi-save-error",{detail:fallbackError}));
			return false;
		}
	}
};
export const createEnglishStudy=emptyEnglishStudy;
export const createSubjectState=emptySubjectState;
