/* Keep native form validation behavior while presenting its messages in Georgian. */
function georgianFieldName(field){
 const label=field.closest('.field')?.querySelector('label')?.textContent||field.labels?.[0]?.textContent||field.getAttribute('aria-label')||'';
 return label.replace(/\*/g,'').trim()||'ეს ველი';
}

function georgianValidationMessage(field){
 const validity=field.validity,name=georgianFieldName(field);
 if(validity.valueMissing)return `${name} აუცილებელია.`;
 if(validity.typeMismatch&&field.type==='email')return 'ელფოსტის მისამართი სწორად შეიყვანე.';
 if(validity.typeMismatch&&field.type==='url')return 'ბმული სწორად შეიყვანე.';
 if(validity.patternMismatch&&field.type==='tel')return 'ტელეფონის ნომერი სწორ ფორმატში შეიყვანე.';
 if(validity.patternMismatch)return `${name} სწორ ფორმატში შეიყვანე.`;
 if(validity.tooShort)return `შეიყვანე სულ მცირე ${field.minLength} სიმბოლო.`;
 if(validity.tooLong)return `შეიყვანე არაუმეტეს ${field.maxLength} სიმბოლო.`;
 if(validity.rangeUnderflow)return field.type==='date'?'აირჩიე დღეს ან უფრო გვიანი თარიღი.':`მნიშვნელობა ${field.min}-ზე ნაკლები არ უნდა იყოს.`;
 if(validity.rangeOverflow)return `მნიშვნელობა ${field.max}-ზე მეტი არ უნდა იყოს.`;
 if(validity.stepMismatch)return 'აირჩიე ან შეიყვანე დასაშვები მნიშვნელობა.';
 if(validity.badInput)return 'მონაცემი სწორად შეიყვანე.';
 return `${name} გადაამოწმე.`;
}

document.addEventListener('invalid',event=>{
 const field=event.target;
 if(!(field instanceof HTMLInputElement||field instanceof HTMLSelectElement||field instanceof HTMLTextAreaElement))return;
 field.setCustomValidity('');
 field.setCustomValidity(georgianValidationMessage(field));
},true);

const clearGeorgianValidation=event=>{
 const field=event.target;
 if(field instanceof HTMLInputElement||field instanceof HTMLSelectElement||field instanceof HTMLTextAreaElement)field.setCustomValidity('');
};
document.addEventListener('input',clearGeorgianValidation,true);
document.addEventListener('change',clearGeorgianValidation,true);
