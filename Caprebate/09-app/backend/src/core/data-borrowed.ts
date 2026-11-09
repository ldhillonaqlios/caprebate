/**
 * BORROWED: SQL ON OTHER AREAS' TABLES, RUN FROM THE CORE (09-app/docs/ARCHITECTURE.md rules 3
 * and 4). These statements were in core's page and logic files, which may not run SQL (rule 4). They read or write
 * tables a business area owns, so they still go against rule 3 (each counted against the table's owner), and Phase
 * 161l (the tangle undone) moves each one to its owner's data file, reached through that owner's front door or an
 * event. Nothing new belongs here: this file only gets shorter. Text unchanged from the caller.
 */
import type { Db, Param, Row } from './db.ts';

// saved_keys
