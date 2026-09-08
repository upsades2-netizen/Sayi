const key="sayi-v1";
const booksDbName="sayi-books-v1";
const booksStoreName="books";
const bookFilesStoreName="files";
const emptySubjectState=()=>({lessons:{},items:{},dailyTasks:[],exams:[],reviewTasks:[]});
const seed={studyLog:[],subjects:[{id:"s1",name:"الرياضيات",color:"purple",chapters:[{id:"c1",name:"الفصل الأول: المشتقات",lessons:[{id:"l1",name:"مقدمة في المشتقات",done:true,today:true},{id:"l2",name:"قواعد الاشتقاق",done:false,today:true}]},{id:"c2",name:"الفصل الثاني: التكامل",lessons:[{id:"l3",name:"التكامل غير المحدد",done:false,today:false}]}]}],tasks:[],legacyTasks:[],subjectState:{}};
export const load=()=>{
	try{
		const value=JSON.parse(localStorage.getItem(key))||structuredClone(seed);
		value.subjectState ??= {};
		value.legacyTasks ??= [];
		return value;
	}catch{return structuredClone(seed)}
};
const openBooksDb=()=>new Promise((resolve,reject)=>{
	if(!globalThis.indexedDB){reject(new Error("IndexedDB غير متاح في هذا المتصفح"));return}
	const request=indexedDB.open(booksDbName,1);
	request.onupgradeneeded=()=>{
		const db=request.result;
		if(!db.objectStoreNames.contains(booksStoreName)) db.createObjectStore(booksStoreName,{keyPath:"id"});
		if(!db.objectStoreNames.contains(bookFilesStoreName)) db.createObjectStore(bookFilesStoreName,{keyPath:"id"});
	};
	request.onsuccess=()=>resolve(request.result);
	request.onerror=()=>reject(request.error);
});
const requestResult=request=>new Promise((resolve,reject)=>{
	request.onsuccess=()=>resolve(request.result);
	request.onerror=()=>reject(request.error);
});
export const listBooks=async()=>{
	const db=await openBooksDb();
	try{return await requestResult(db.transaction(booksStoreName,"readonly").objectStore(booksStoreName).getAll());}
	finally{db.close()}
};
export const addBook=async(book,file)=>{
	const db=await openBooksDb();
	try{await new Promise((resolve,reject)=>{
		const transaction=db.transaction([booksStoreName,bookFilesStoreName],"readwrite");
		transaction.objectStore(booksStoreName).put(book);
		transaction.objectStore(bookFilesStoreName).put({id:book.id,file});
		transaction.oncomplete=resolve;
		transaction.onerror=()=>reject(transaction.error);
	});}
	finally{db.close()}
};
export const getBookFile=async id=>{
	const db=await openBooksDb();
	try{return (await requestResult(db.transaction(bookFilesStoreName,"readonly").objectStore(bookFilesStoreName).get(id)))?.file||null;}
	finally{db.close()}
};
export const removeBook=async id=>{
	const db=await openBooksDb();
	try{await new Promise((resolve,reject)=>{
		const transaction=db.transaction([booksStoreName,bookFilesStoreName],"readwrite");
		transaction.objectStore(booksStoreName).delete(id);
		transaction.objectStore(bookFilesStoreName).delete(id);
		transaction.oncomplete=resolve;
		transaction.onerror=()=>reject(transaction.error);
	});}
	finally{db.close()}
};
export const save=x=>{
	try{
		localStorage.setItem(key,JSON.stringify(x));
		globalThis.dispatchEvent?.(new CustomEvent("sayi-saved"));
		return true;
	}catch(error){
		try{
			const fallback=structuredClone(x);
			localStorage.setItem(key,JSON.stringify(fallback));
			globalThis.dispatchEvent?.(new CustomEvent("sayi-saved"));
			return true;
		}catch(fallbackError){
			console.error("Sayi could not save data",fallbackError);
			globalThis.dispatchEvent?.(new CustomEvent("sayi-save-error",{detail:fallbackError}));
			return false;
		}
	}
};
export const createSubjectState=emptySubjectState;
