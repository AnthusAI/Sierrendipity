//! `std` for the Compilation Explorer's RISC-V emulator.
//!
//! The student's program is an ordinary Rust crate (`fn main`, `use std::io;`, `println!`), compiled
//! with `--extern std=<this rlib>`: the compiler's implicit `extern crate std` resolves to this crate,
//! which is `no_std` itself and offers the subset of `std` that a bare-metal emulator can support,
//! built on `core` and `alloc`. I/O goes through the Linux-like ecall ABI of the emulator
//! (a7 = 63 read, 64 write, 93 exit). Built once, with RUSTC_BOOTSTRAP=1 for the `start` lang item
//! (see runner/Dockerfile); the student's compile is plain stable rustc.
#![no_std]
#![feature(lang_items, never_type, rustc_attrs)]
#![allow(internal_features, deprecated)]
#![crate_name = "std"]

extern crate alloc;

// ---- the parts of std that are core or alloc under another name ----
pub use alloc::{borrow, boxed, format, rc, slice, str, string, vec};
pub use core::{
    any, array, ascii, cell, char, clone, cmp, convert, default, f32, f64, hash, hint, i128, i16, i32, i64, i8, isize,
    iter, marker, mem, num, ops, option, pin, ptr, result, u128, u16, u32, u64, u8, usize,
};
pub use core::{
    assert_eq, assert_ne, concat, debug_assert, debug_assert_eq, debug_assert_ne, line, matches, panic, todo,
    unimplemented, unreachable, write, writeln,
};
#[doc(hidden)]
pub use core::{column, file, format_args as __format_args, stringify};

pub mod fmt {
    pub use alloc::fmt::format;
    pub use core::fmt::*;
}

pub mod collections {
    pub use alloc::collections::{binary_heap, btree_map, btree_set, linked_list, vec_deque};
    pub use alloc::collections::{BTreeMap, BTreeSet, BinaryHeap, LinkedList, VecDeque};
}

pub mod prelude {
    pub mod v1 {
        pub use super::rust_2021::*;
    }
    pub mod rust_2015 {
        pub use super::rust_2021::*;
    }
    pub mod rust_2018 {
        pub use super::rust_2021::*;
    }
    pub mod rust_2021 {
        pub use alloc::borrow::ToOwned;
        pub use alloc::boxed::Box;
        pub use alloc::string::{String, ToString};
        pub use alloc::vec::Vec;
        pub use core::prelude::rust_2021::*;
        pub use crate::FloatMath;
        // The compiler no longer injects `#[macro_use] extern crate std`, so the macros ride in the prelude.
        pub use crate::{
            assert_eq, assert_ne, debug_assert, debug_assert_eq, debug_assert_ne, dbg, eprint, eprintln, format, matches,
            panic, print, println, todo, unimplemented, unreachable, vec, write, writeln,
        };
    }
    pub mod rust_2024 {
        pub use super::rust_2021::*;
    }
}

// ---- float methods that std has but core does not (no libm on the emulator) ----
/// `sqrt`, `floor`, `ceil`, `round`, `trunc` and `powi`, written out in plain Rust. In the prelude, so
/// `x.sqrt()` works as it does with the real std. Not here: `powf`, `sin`, `cos`, `ln`, `exp` and friends.
pub trait FloatMath: Sized {
    fn sqrt(self) -> Self;
    fn floor(self) -> Self;
    fn ceil(self) -> Self;
    fn round(self) -> Self;
    fn trunc(self) -> Self;
    fn powi(self, n: i32) -> Self;
}

fn trunc64(x: f64) -> f64 {
    let bits = x.to_bits();
    let exp = ((bits >> 52) & 0x7ff) as i32 - 1023;
    if exp < 0 {
        f64::from_bits(bits & (1 << 63)) // a fraction only: zero with the sign
    } else if exp >= 52 {
        x // already whole (or infinite or not a number)
    } else {
        f64::from_bits(bits & !((1u64 << (52 - exp)) - 1))
    }
}

impl FloatMath for f64 {
    fn trunc(self) -> f64 {
        trunc64(self)
    }
    fn floor(self) -> f64 {
        let t = trunc64(self);
        if self < 0.0 && t != self { t - 1.0 } else { t }
    }
    fn ceil(self) -> f64 {
        let t = trunc64(self);
        if self > 0.0 && t != self { t + 1.0 } else { t }
    }
    fn round(self) -> f64 {
        let t = trunc64(self);
        if (self - t).abs() >= 0.5 { t + self.signum() } else { t }
    }
    fn sqrt(self) -> f64 {
        if self.is_nan() || self < 0.0 {
            return f64::NAN;
        }
        if self == 0.0 || self.is_infinite() {
            return self;
        }
        // A bit-level first guess, then Newton's method.
        let mut y = f64::from_bits((self.to_bits() >> 1) + (1023u64 << 51));
        for _ in 0..6 {
            y = 0.5 * (y + self / y);
        }
        y
    }
    fn powi(self, n: i32) -> f64 {
        let mut result = 1.0;
        let mut base = self;
        let mut e = n.unsigned_abs();
        while e > 0 {
            if e & 1 == 1 {
                result *= base;
            }
            base *= base;
            e >>= 1;
        }
        if n < 0 { 1.0 / result } else { result }
    }
}

impl FloatMath for f32 {
    fn trunc(self) -> f32 {
        trunc64(self as f64) as f32
    }
    fn floor(self) -> f32 {
        FloatMath::floor(self as f64) as f32
    }
    fn ceil(self) -> f32 {
        FloatMath::ceil(self as f64) as f32
    }
    fn round(self) -> f32 {
        FloatMath::round(self as f64) as f32
    }
    fn sqrt(self) -> f32 {
        FloatMath::sqrt(self as f64) as f32
    }
    fn powi(self, n: i32) -> f32 {
        FloatMath::powi(self as f64, n) as f32
    }
}

// ---- system calls ----
mod sys {
    #[inline(always)]
    pub fn ecall3(n: usize, a: usize, b: usize, c: usize) -> isize {
        let ret: isize;
        unsafe {
            core::arch::asm!("ecall", in("a7") n, inlateout("a0") a as isize => ret, in("a1") b, in("a2") c);
        }
        ret
    }
    pub fn write(fd: usize, bytes: &[u8]) {
        let mut left = bytes;
        while !left.is_empty() {
            let n = ecall3(64, fd, left.as_ptr() as usize, left.len());
            if n <= 0 {
                return;
            }
            left = &left[n as usize..];
        }
    }
    pub fn read(fd: usize, buf: &mut [u8]) -> usize {
        let n = ecall3(63, fd, buf.as_mut_ptr() as usize, buf.len());
        if n < 0 {
            0
        } else {
            n as usize
        }
    }
    pub fn exit(code: i32) -> ! {
        loop {
            ecall3(93, code as usize, 0, 0);
        }
    }
}

// ---- memory: a bump allocator over the linker script's heap ----
mod heap {
    use core::alloc::{GlobalAlloc, Layout};
    use core::cell::UnsafeCell;

    extern "C" {
        static __heap_start: u8;
        static __heap_end: u8;
    }

    pub struct Bump {
        next: UnsafeCell<usize>,
        last: UnsafeCell<usize>,
    }
    unsafe impl Sync for Bump {}

    #[global_allocator]
    static ALLOCATOR: Bump = Bump { next: UnsafeCell::new(0), last: UnsafeCell::new(0) };

    unsafe impl GlobalAlloc for Bump {
        unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
            let next = self.next.get();
            if *next == 0 {
                *next = core::ptr::addr_of!(__heap_start) as usize;
            }
            let start = (*next + layout.align() - 1) & !(layout.align() - 1);
            let end = match start.checked_add(layout.size()) {
                Some(end) if end <= core::ptr::addr_of!(__heap_end) as usize => end,
                _ => return core::ptr::null_mut(),
            };
            *next = end;
            *self.last.get() = start;
            start as *mut u8
        }
        unsafe fn dealloc(&self, ptr: *mut u8, _layout: Layout) {
            // Only the newest block can be given back; everything else is never reused.
            if ptr as usize == *self.last.get() {
                *self.next.get() = ptr as usize;
            }
        }
        unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
            if ptr as usize == *self.last.get() {
                // The newest block grows (or shrinks) in place.
                if let Some(end) = (ptr as usize).checked_add(new_size) {
                    if end <= core::ptr::addr_of!(__heap_end) as usize {
                        *self.next.get() = end;
                        return ptr;
                    }
                }
                return core::ptr::null_mut();
            }
            let new = self.alloc(Layout::from_size_align_unchecked(new_size, layout.align()));
            if !new.is_null() {
                core::ptr::copy_nonoverlapping(ptr, new, core::cmp::min(layout.size(), new_size));
            }
            new
        }
    }
}

// The two symbols rustc itself generates when it links an executable (the allocator shim). The explorer
// links with the GNU linker from an object file instead (rustc's own linker step needs a syscall the
// sandbox denies), so they are defined here, with the names the compiler gives them.
#[rustc_std_internal_symbol]
pub fn __rust_no_alloc_shim_is_unstable_v2() {}

#[rustc_std_internal_symbol]
pub fn __rust_alloc_error_handler(size: usize, _align: usize) -> ! {
    panic!("memory allocation of {size} bytes failed")
}

// ---- panics ----
#[panic_handler]
fn panic(info: &core::panic::PanicInfo) -> ! {
    use core::fmt::Write;
    let mut err = io::Stderr;
    match info.location() {
        Some(l) => {
            let _ = write!(err, "thread 'main' panicked at {}:{}:{}:\n{}\n", l.file(), l.line(), l.column(), info.message());
        }
        None => {
            let _ = write!(err, "thread 'main' panicked:\n{}\n", info.message());
        }
    }
    let _ = err.write_str("note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace\n");
    sys::exit(101)
}

// ---- std::process ----
pub mod process {
    pub fn exit(code: i32) -> ! {
        super::sys::exit(code)
    }
    pub fn abort() -> ! {
        super::sys::exit(134)
    }

    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    pub struct ExitCode(u8);
    impl ExitCode {
        pub const SUCCESS: ExitCode = ExitCode(0);
        pub const FAILURE: ExitCode = ExitCode(1);
    }
    impl From<u8> for ExitCode {
        fn from(code: u8) -> Self {
            ExitCode(code)
        }
    }

    #[lang = "termination"]
    pub trait Termination {
        fn report(self) -> ExitCode;
    }
    impl Termination for () {
        fn report(self) -> ExitCode {
            ExitCode::SUCCESS
        }
    }
    impl Termination for ExitCode {
        fn report(self) -> ExitCode {
            self
        }
    }
    impl Termination for ! {
        fn report(self) -> ExitCode {
            self
        }
    }
    impl<T: Termination, E: core::fmt::Debug> Termination for Result<T, E> {
        fn report(self) -> ExitCode {
            match self {
                Ok(v) => v.report(),
                Err(e) => {
                    crate::eprintln!("Error: {e:?}");
                    ExitCode::FAILURE
                }
            }
        }
    }
    pub(crate) fn code(c: ExitCode) -> i32 {
        c.0 as i32
    }
}

#[lang = "start"]
fn lang_start<T: process::Termination + 'static>(main: fn() -> T, _argc: isize, _argv: *const *const u8, _sigpipe: u8) -> isize {
    // black_box keeps the optimizer from folding `main` into this function: the student's code stays
    // its own function (`main::main`) at every optimization level.
    process::code(core::hint::black_box(main)().report()) as isize
}

// ---- std::io ----
pub mod io {
    use alloc::string::String;
    use alloc::vec::Vec;
    use core::fmt;

    #[derive(Debug)]
    pub struct Error {
        message: &'static str,
    }
    impl Error {
        pub fn other(message: &'static str) -> Error {
            Error { message }
        }
    }
    impl fmt::Display for Error {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
            f.write_str(self.message)
        }
    }
    pub type Result<T> = core::result::Result<T, Error>;

    pub trait Write {
        fn write(&mut self, buf: &[u8]) -> Result<usize>;
        fn flush(&mut self) -> Result<()>;
        fn write_all(&mut self, mut buf: &[u8]) -> Result<()> {
            while !buf.is_empty() {
                let n = self.write(buf)?;
                buf = &buf[n..];
            }
            Ok(())
        }
        fn write_fmt(&mut self, args: fmt::Arguments<'_>) -> Result<()> {
            struct Adapter<'a, W: ?Sized>(&'a mut W, Result<()>);
            impl<W: Write + ?Sized> fmt::Write for Adapter<'_, W> {
                fn write_str(&mut self, s: &str) -> fmt::Result {
                    self.0.write_all(s.as_bytes()).map_err(|e| {
                        self.1 = Err(e);
                        fmt::Error
                    })
                }
            }
            let mut a = Adapter(self, Ok(()));
            match fmt::write(&mut a, args) {
                Ok(()) => Ok(()),
                Err(_) => a.1,
            }
        }
    }

    pub trait Read {
        fn read(&mut self, buf: &mut [u8]) -> Result<usize>;
        fn read_to_string(&mut self, buf: &mut String) -> Result<usize> {
            let mut bytes = Vec::new();
            let mut chunk = [0u8; 64];
            loop {
                let n = self.read(&mut chunk)?;
                if n == 0 {
                    break;
                }
                bytes.extend_from_slice(&chunk[..n]);
            }
            let n = bytes.len();
            buf.push_str(&String::from_utf8_lossy(&bytes));
            Ok(n)
        }
    }

    /// `io::read_to_string(io::stdin())`
    pub fn read_to_string<R: Read>(mut reader: R) -> Result<String> {
        let mut s = String::new();
        reader.read_to_string(&mut s)?;
        Ok(s)
    }

    pub struct Stdout;
    pub struct Stderr;
    pub type StdoutLock<'a> = Stdout;
    pub type StderrLock<'a> = Stderr;
    pub fn stdout() -> Stdout {
        Stdout
    }
    pub fn stderr() -> Stderr {
        Stderr
    }
    impl Stdout {
        pub fn lock(&self) -> Stdout {
            Stdout
        }
    }
    impl Stderr {
        pub fn lock(&self) -> Stderr {
            Stderr
        }
    }
    impl Write for Stdout {
        fn write(&mut self, buf: &[u8]) -> Result<usize> {
            super::sys::write(1, buf);
            Ok(buf.len())
        }
        fn flush(&mut self) -> Result<()> {
            Ok(())
        }
    }
    impl Write for Stderr {
        fn write(&mut self, buf: &[u8]) -> Result<usize> {
            super::sys::write(2, buf);
            Ok(buf.len())
        }
        fn flush(&mut self) -> Result<()> {
            Ok(())
        }
    }
    impl fmt::Write for Stdout {
        fn write_str(&mut self, s: &str) -> fmt::Result {
            super::sys::write(1, s.as_bytes());
            Ok(())
        }
    }
    impl fmt::Write for Stderr {
        fn write_str(&mut self, s: &str) -> fmt::Result {
            super::sys::write(2, s.as_bytes());
            Ok(())
        }
    }

    #[doc(hidden)]
    pub fn _print(args: fmt::Arguments<'_>) {
        let _ = fmt::Write::write_fmt(&mut Stdout, args);
    }
    #[doc(hidden)]
    pub fn _println(args: fmt::Arguments<'_>) {
        _print(args);
        super::sys::write(1, b"\n");
    }
    #[doc(hidden)]
    pub fn _eprintln(args: fmt::Arguments<'_>) {
        _eprint(args);
        super::sys::write(2, b"\n");
    }
    #[doc(hidden)]
    pub fn _eprint(args: fmt::Arguments<'_>) {
        let _ = fmt::Write::write_fmt(&mut Stderr, args);
    }

    // Standard input, one byte at a time through the read ecall (it waits in the emulator until
    // the student types). A line is the bytes up to and including '\n'; 0 bytes means end of input.
    pub struct Stdin;
    pub type StdinLock<'a> = Stdin;
    pub fn stdin() -> Stdin {
        Stdin
    }
    impl Stdin {
        pub fn lock(&self) -> Stdin {
            Stdin
        }
        pub fn read_line(&self, buf: &mut String) -> Result<usize> {
            BufRead::read_line(&mut Stdin, buf)
        }
        pub fn lines(self) -> Lines<Stdin> {
            BufRead::lines(self)
        }
    }
    impl Read for Stdin {
        fn read(&mut self, buf: &mut [u8]) -> Result<usize> {
            Ok(super::sys::read(0, buf))
        }
    }

    pub trait BufRead: Read {
        fn read_line(&mut self, buf: &mut String) -> Result<usize> {
            let mut bytes = Vec::new();
            let mut one = [0u8; 1];
            loop {
                if self.read(&mut one)? == 0 {
                    break;
                }
                bytes.push(one[0]);
                if one[0] == b'\n' {
                    break;
                }
            }
            let n = bytes.len();
            match String::from_utf8(bytes) {
                Ok(s) => buf.push_str(&s),
                Err(_) => return Err(Error::other("stream did not contain valid UTF-8")),
            }
            Ok(n)
        }
        fn lines(self) -> Lines<Self>
        where
            Self: Sized,
        {
            Lines { inner: self }
        }
    }
    impl BufRead for Stdin {}

    pub struct Lines<B> {
        inner: B,
    }
    impl<B: BufRead> Iterator for Lines<B> {
        type Item = Result<String>;
        fn next(&mut self) -> Option<Result<String>> {
            let mut line = String::new();
            match self.inner.read_line(&mut line) {
                Ok(0) => None,
                Ok(_) => {
                    if line.ends_with('\n') {
                        line.pop();
                        if line.ends_with('\r') {
                            line.pop();
                        }
                    }
                    Some(Ok(line))
                }
                Err(e) => Some(Err(e)),
            }
        }
    }

    pub mod prelude {
        pub use super::{BufRead, Read, Write};
    }
}

// ---- macros ----
#[macro_export]
macro_rules! print {
    ($($arg:tt)*) => {{ $crate::io::_print($crate::__format_args!($($arg)*)); }};
}
#[macro_export]
macro_rules! println {
    () => { $crate::print!("\n") };
    ($($arg:tt)*) => {{ $crate::io::_println($crate::__format_args!($($arg)*)); }};
}
#[macro_export]
macro_rules! eprint {
    ($($arg:tt)*) => {{ $crate::io::_eprint($crate::__format_args!($($arg)*)); }};
}
#[macro_export]
macro_rules! eprintln {
    () => { $crate::eprint!("\n") };
    ($($arg:tt)*) => {{ $crate::io::_eprintln($crate::__format_args!($($arg)*)); }};
}
#[macro_export]
macro_rules! dbg {
    () => { $crate::eprintln!("[{}:{}:{}]", $crate::file!(), $crate::line!(), $crate::column!()) };
    ($val:expr $(,)?) => {
        match $val {
            tmp => {
                $crate::eprintln!("[{}:{}:{}] {} = {:#?}", $crate::file!(), $crate::line!(), $crate::column!(), $crate::stringify!($val), &tmp);
                tmp
            }
        }
    };
    ($($val:expr),+ $(,)?) => { ($($crate::dbg!($val)),+,) };
}
