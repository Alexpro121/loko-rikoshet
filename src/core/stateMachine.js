/** Мінімальна стейт-машина: MENU / MATCH / GOAL / RESULT. */
export class StateMachine {
  constructor() { this.states = {}; this.current = null; this.name = ''; }

  add(name, handlers) { this.states[name] = handlers; return this; }

  go(name, data) {
    const prev = this.current;
    if (prev && prev.exit) prev.exit(name);
    const from = this.name;
    this.name = name;
    this.current = this.states[name];
    if (this.current.enter) this.current.enter(data, from);
  }

  update(dt) { if (this.current && this.current.update) this.current.update(dt); }
}
