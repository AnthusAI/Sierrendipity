#ifndef _SIERR_STDIO_H
#define _SIERR_STDIO_H
#include <stddef.h>

#define EOF (-1)

int putchar(int c);
int getchar(void);
int puts(const char *s);
int printf(const char *format, ...);
int scanf(const char *format, ...);
/* Output is not buffered, so fflush does nothing; fflush(stdout) compiles. */
int fflush(void *stream);
#define stdout ((void *)0)
#define stdin ((void *)0)
#endif
