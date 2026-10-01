const fs = require('fs');
const path = require('path');

const contactsPath = path.join(__dirname, 'contacts.json');

class ContactsManager {
  getAll() {
    try {
      if (fs.existsSync(contactsPath)) {
        const raw = fs.readFileSync(contactsPath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn('Error reading contacts.json:', e);
    }
    return [];
  }

  save(contacts) {
    try {
      fs.writeFileSync(contactsPath, JSON.stringify(contacts, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error('Error saving contacts.json:', e);
      return false;
    }
  }

  add(name, manager = '미지정', phone = '미등록', notes = '') {
    const list = this.getAll();
    const newEntry = {
      id: Date.now(),
      name,
      manager,
      phone,
      notes
    };
    list.push(newEntry);
    this.save(list);
    return newEntry;
  }
}

module.exports = new ContactsManager();
