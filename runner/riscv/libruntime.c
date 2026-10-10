/* A minimal libc for bare-metal RV32IM programs compiled by POST /explain. Input and output go
   through the emulator's Linux-like ecall ABI: a7=93 exit, a7=64 write, a7=63 read. Compiled with -O1.
   No floating-point printf or scanf: float and double programs compile (libgcc soft-float) but
   printing them is unsupported. */
#include <stdarg.h>
#include <stddef.h>

#include "stdio.h"
#include "stdlib.h"
#include "string.h"

static long ecall3(long n, long a, long b, long c) {
  register long a0 __asm__("a0") = a;
  register long a1 __asm__("a1") = b;
  register long a2 __asm__("a2") = c;
  register long a7 __asm__("a7") = n;
  __asm__ volatile("ecall" : "+r"(a0) : "r"(a1), "r"(a2), "r"(a7) : "memory");
  return a0;
}

/* ---- process ---- */

void exit(int status) {
  ecall3(93, status, 0, 0);
  for (;;) {
  }
}

int abs(int n) { return n < 0 ? -n : n; }

int atoi(const char *s) {
  while (*s == ' ' || (*s >= '\t' && *s <= '\r')) s++;
  int sign = 1;
  if (*s == '-' || *s == '+') sign = (*s++ == '-') ? -1 : 1;
  int n = 0;
  while (*s >= '0' && *s <= '9') n = n * 10 + (*s++ - '0');
  return sign * n;
}

/* ---- memory ---- */

extern char __heap_start[], __heap_end[];
static char *heap_next;

void *malloc(size_t size) {
  if (!heap_next) heap_next = __heap_start;
  size = (size + 15) & ~(size_t)15;
  if (size > (size_t)(__heap_end - heap_next)) return NULL;
  void *p = heap_next;
  heap_next += size;
  return p;
}

void free(void *p) { (void)p; }

/* ---- string.h ---- */

size_t strlen(const char *s) {
  const char *p = s;
  while (*p) p++;
  return (size_t)(p - s);
}

int strcmp(const char *a, const char *b) {
  while (*a && *a == *b) {
    a++;
    b++;
  }
  return (unsigned char)*a - (unsigned char)*b;
}

char *strcpy(char *dst, const char *src) {
  char *d = dst;
  while ((*d++ = *src++)) {
  }
  return dst;
}

void *memcpy(void *dst, const void *src, size_t n) {
  unsigned char *d = dst;
  const unsigned char *s = src;
  while (n--) *d++ = *s++;
  return dst;
}

void *memset(void *dst, int c, size_t n) {
  unsigned char *d = dst;
  while (n--) *d++ = (unsigned char)c;
  return dst;
}

int memcmp(const void *a, const void *b, size_t n) {
  const unsigned char *x = a, *y = b;
  for (; n; n--, x++, y++) {
    if (*x != *y) return *x - *y;
  }
  return 0;
}

/* ---- stdio ---- */

int putchar(int c) {
  char ch = (char)c;
  return ecall3(64, 1, (long)&ch, 1) == 1 ? (unsigned char)ch : EOF;
}

int puts(const char *s) {
  ecall3(64, 1, (long)s, (long)strlen(s));
  putchar('\n');
  return 1;
}

int fflush(void *stream) {
  (void)stream;
  return 0;
}

static int pushed = -2; /* one character of lookahead for scanf; -2 means none */

int getchar(void) {
  if (pushed != -2) {
    int c = pushed;
    pushed = -2;
    return c;
  }
  unsigned char ch;
  return ecall3(63, 0, (long)&ch, 1) == 1 ? ch : EOF;
}

static void unget(int c) { pushed = c; }

static int is_space(int c) { return c == ' ' || (c >= '\t' && c <= '\r'); }

static int put_padded(const char *digits, int len, int width, int zero, int left, int negative) {
  int count = 0;
  int pad = width - len - negative;
  if (negative && zero) count += putchar('-') != EOF;
  if (!left)
    while (pad-- > 0) count += putchar(zero ? '0' : ' ') != EOF;
  if (negative && !zero) count += putchar('-') != EOF;
  for (int i = 0; i < len; i++) count += putchar(digits[i]) != EOF;
  if (left)
    while (pad-- > 0) count += putchar(' ') != EOF;
  return count;
}

static int put_number(unsigned value, unsigned base, int upper, int negative, int width, int zero, int left) {
  char buf[12];
  int len = 0;
  do {
    unsigned d = value % base;
    buf[len++] = (char)(d < 10 ? '0' + d : (upper ? 'A' : 'a') + d - 10);
    value /= base;
  } while (value);
  char digits[12];
  for (int i = 0; i < len; i++) digits[i] = buf[len - 1 - i];
  return put_padded(digits, len, width, zero && !left, left, negative);
}

int printf(const char *format, ...) {
  va_list ap;
  va_start(ap, format);
  int count = 0;
  for (const char *p = format; *p; p++) {
    if (*p != '%') {
      count += putchar(*p) != EOF;
      continue;
    }
    p++;
    int zero = 0, left = 0, width = 0;
    for (;; p++) {
      if (*p == '0') zero = 1;
      else if (*p == '-') left = 1;
      else break;
    }
    while (*p >= '0' && *p <= '9') width = width * 10 + (*p++ - '0');
    while (*p == 'l') p++; /* long is 32 bits here, like int */
    switch (*p) {
      case 'd':
      case 'i': {
        int v = va_arg(ap, int);
        count += put_number(v < 0 ? 0u - (unsigned)v : (unsigned)v, 10, 0, v < 0, width, zero, left);
        break;
      }
      case 'u': count += put_number(va_arg(ap, unsigned), 10, 0, 0, width, zero, left); break;
      case 'x': count += put_number(va_arg(ap, unsigned), 16, 0, 0, width, zero, left); break;
      case 'X': count += put_number(va_arg(ap, unsigned), 16, 1, 0, width, zero, left); break;
      case 'c': {
        char ch = (char)va_arg(ap, int);
        count += put_padded(&ch, 1, width, 0, left, 0);
        break;
      }
      case 's': {
        const char *s = va_arg(ap, const char *);
        if (!s) s = "(null)";
        count += put_padded(s, (int)strlen(s), width, 0, left, 0);
        break;
      }
      case '%': count += putchar('%') != EOF; break;
      case '\0': p--; break; /* a lone % at the end of the format */
      default: count += putchar('%') != EOF; count += putchar(*p) != EOF; break;
    }
  }
  va_end(ap);
  return count;
}

int scanf(const char *format, ...) {
  va_list ap;
  va_start(ap, format);
  int assigned = 0, eof = 0;
  for (const char *p = format; *p; p++) {
    if (is_space(*p)) {
      int c;
      while (is_space(c = getchar())) {
      }
      unget(c);
      continue;
    }
    if (*p != '%') {
      int c = getchar();
      if (c != *p) {
        unget(c);
        break;
      }
      continue;
    }
    p++;
    int width = 0;
    while (*p >= '0' && *p <= '9') width = width * 10 + (*p++ - '0');
    if (*p == '%') {
      int c = getchar();
      if (c != '%') {
        unget(c);
        break;
      }
      continue;
    }
    if (*p == 'c') {
      int c = getchar();
      if (c == EOF) {
        eof = 1;
        break;
      }
      *va_arg(ap, char *) = (char)c;
      assigned++;
      continue;
    }
    int c;
    while (is_space(c = getchar())) {
    }
    if (c == EOF) {
      eof = 1;
      break;
    }
    if (*p == 'd') {
      int sign = 1;
      if (c == '-' || c == '+') {
        sign = c == '-' ? -1 : 1;
        c = getchar();
      }
      if (c < '0' || c > '9') {
        unget(c);
        break;
      }
      int n = 0;
      while (c >= '0' && c <= '9') {
        n = n * 10 + (c - '0');
        c = getchar();
      }
      unget(c);
      *va_arg(ap, int *) = sign * n;
      assigned++;
    } else if (*p == 's') {
      char *out = va_arg(ap, char *);
      int n = 0;
      while (c != EOF && !is_space(c) && (width == 0 || n < width)) {
        out[n++] = (char)c;
        c = getchar();
      }
      unget(c);
      out[n] = '\0';
      assigned++;
    } else {
      unget(c);
      break; /* unsupported conversion */
    }
  }
  va_end(ap);
  return assigned == 0 && eof ? EOF : assigned;
}
