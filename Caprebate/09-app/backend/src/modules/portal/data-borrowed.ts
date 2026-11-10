/**
 * BORROWED: SQL ON OTHER AREAS' TABLES, RUN FROM THE CLIENT PORTAL (09-app/docs/ARCHITECTURE.md rules 3 and 4). These statements
 * were in this module's page and logic files, which may not run SQL (rule 4). They read or write tables another area
 * owns, or join this module's tables to another's, so they still go against rule 3 (each counted against the table's
 * owner). Phase 161l1 moves each to its owner's data file, reached through that owner's front door or an event. Nothing
 * new belongs here: this file only gets shorter. Text unchanged from the caller.
 */

// Phase 161l1: nothing is borrowed any more. Every statement went to its owner, reached through the owner's front door
// (see the portal's data file).
export {};
