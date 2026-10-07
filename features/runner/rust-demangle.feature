Feature: Readable names for Rust symbols
  rustc 1.99 mangles symbols with the v0 scheme. The explorer shows beginners names such as
  `main::sum_to` and `<main::Point as core::fmt::Display>::fmt`: no hashes, no disambiguators, no
  generic arguments, and the defining crate tells the student's code from the runtime.

  Scenario Outline: A v0 symbol is demangled
    When the Rust symbol "<symbol>" is demangled
    Then the name is "<name>"
    And the defining crate is "<crate>"

    Examples:
      | symbol                                                                                                                                                | name                                                                                                 | crate |
      | _RNvCs18tljLP6NM4_4main6sum_to                                                                                                                         | main::sum_to                                                                                         | main  |
      | _RNvNtCs18tljLP6NM4_4main4util5twice                                                                                                                   | main::util::twice                                                                                    | main  |
      | _RNvNtCsgMctYBNNeq2_3std2io5stdin                                                                                                                      | std::io::stdin                                                                                       | std   |
      | _RNvNtCscgJ1QsVxagZ_4core3str16slice_error_fail                                                                                                        | core::str::slice_error_fail                                                                          | core  |
      | _RNvNtNtNtCscgJ1QsVxagZ_4core7unicode12unicode_data13cn_planes_0_311lookup_slow                                                                        | core::unicode::unicode_data::cn_planes_0_3::lookup_slow                                              | core  |
      | _RNCNvCs18tljLP6NM4_4main4main0B3_                                                                                                                     | main::main::{closure#0}                                                                              | main  |
      | _RNCNvCs18tljLP6NM4_4main4mains0_0B3_                                                                                                                   | main::main::{closure#2}                                                                              | main  |
      | _RNvMNtCsaX7OSDhPL23_5alloc3vecINtB2_3VecNtNtB4_6string6StringE3newCs18tljLP6NM4_4main                                                                | alloc::vec::Vec::new                                                                                 | alloc |
      | _RINvNtNtNtCsaX7OSDhPL23_5alloc11collections5btree4node12slice_insertlECs18tljLP6NM4_4main                                                              | alloc::collections::btree::node::slice_insert                                                        | alloc |
      | _RINvMs2_NtCscgJ1QsVxagZ_4core3fmtNtB6_9Arguments3newKj4_Kj1_ECs18tljLP6NM4_4main                                                                       | core::fmt::Arguments::new                                                                            | core  |
      | _RNvMsa_NtCscgJ1QsVxagZ_4core3fmtNtB5_9Formatter26debug_struct_field1_finish                                                                           | core::fmt::Formatter::debug_struct_field1_finish                                                     | core  |
      | _RNvNvMsa_NtCscgJ1QsVxagZ_4core3fmtNtB7_9Formatter12pad_integral12write_prefix                                                                         | core::fmt::Formatter::pad_integral::write_prefix                                                     | core  |
      | _RNvXsi_NtCscgJ1QsVxagZ_4core3fmteNtB5_7Display3fmt                                                                                                    | <str as core::fmt::Display>::fmt                                                                     | core  |
      | _RNvXs1g_NtCscgJ1QsVxagZ_4core3fmtRNtNtCsaX7OSDhPL23_5alloc6string6StringNtB6_5Debug3fmtCs18tljLP6NM4_4main                                             | <&alloc::string::String as core::fmt::Debug>::fmt                                                    | core  |
      | _RNvXsr_NtCscgJ1QsVxagZ_4core3fmtSNtNtCsaX7OSDhPL23_5alloc6string6StringNtB5_5Debug3fmtCs18tljLP6NM4_4main                                             | <[alloc::string::String] as core::fmt::Debug>::fmt                                                   | core  |
      | _RNvXs4_NtNtCscgJ1QsVxagZ_4core4iter5rangeINtNtNtB9_3ops5range5RangejENtNtNtB7_6traits8iterator8Iterator4nextCs18tljLP6NM4_4main                      | <core::ops::range::Range as core::iter::traits::iterator::Iterator>::next                            | core  |
      | _RNvYNtNtCsgMctYBNNeq2_3std2io6StderrNtNtCscgJ1QsVxagZ_4core3fmt5Write10write_charB6_                                                                  | <std::io::Stderr as core::fmt::Write>::write_char                                                    | std   |
      | _RNvXCs18tljLP6NM4_4mainNtCs18tljLP6NM4_4main5PointNtNtCscgJ1QsVxagZ_4core3fmt7Display3fmt                                                                               | <main::Point as core::fmt::Display>::fmt                                                             | main  |

  Scenario Outline: Anything that is not a readable v0 symbol is left alone
    When the Rust symbol "<symbol>" is demangled
    Then the name is "<symbol>"
    And there is no defining crate

    Examples:
      | symbol                              |
      | main                                |
      | _start                              |
      | memcpy                              |
      | __udivdi3                           |
      | _ZN4core3fmt5write17h0123456789abcdefE |
      | _R                                  |
      | _RNv                                |
      | _RNvCs_999999999x                   |
      | _RB5_                               |
      | _RNvB0_3foo                         |
      | _RIB1_B1_E                          |

  Scenario: A hostile symbol that expands exponentially through back-references is refused quickly
    Given a Rust symbol that doubles through 40 back-references
    When the symbol is demangled within 1 second
    Then the name is the symbol itself, shortened to at most 303 characters

  Scenario: A very long symbol is refused
    When the Rust symbol of 100000 characters is demangled
    Then the name is the symbol itself, shortened to at most 303 characters
