#ifndef _SIERR_STDLIB_H
#define _SIERR_STDLIB_H
#include <stddef.h>

void exit(int status) __attribute__((noreturn));
int abs(int n);
int atoi(const char *s);
/* A bump allocator: free() does nothing, and malloc returns NULL once memory runs out. */
void *malloc(size_t size);
void free(void *p);
#endif
