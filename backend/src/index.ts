import { create_app } from './app.js';

create_app().listen(5000, () => {
  console.log(`API listening on http://localhost:5000`);
});
