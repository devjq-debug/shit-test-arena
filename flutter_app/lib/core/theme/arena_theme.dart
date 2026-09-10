import 'package:flutter/material.dart';

abstract final class ArenaColors {
  static const black = Color(0xff09090b);
  static const surface = Color(0xff131315);
  static const card = Color(0xff1c1b1d);
  static const cardBorder = Color(0xff353437);
  static const pink = Color(0xffff2a85);
  static const orange = Color(0xfff97316);
  static const amber = Color(0xfff59e0b);
  static const green = Color(0xff10b981);
  static const red = Color(0xffef4444);
  static const text = Color(0xffe5e1e4);
  static const muted = Color(0xffa8a9b3);
}

ThemeData buildArenaTheme() => ThemeData(
  brightness: Brightness.dark,
  scaffoldBackgroundColor: ArenaColors.black,
  colorScheme: ColorScheme.fromSeed(seedColor: ArenaColors.pink, brightness: Brightness.dark),
  textTheme: const TextTheme(
    displayLarge: TextStyle(fontSize: 56, fontWeight: FontWeight.w900, letterSpacing: -2.2, height: 1.0),
    headlineMedium: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: -1.0),
    bodyLarge: TextStyle(fontSize: 18, height: 1.5),
    bodyMedium: TextStyle(fontSize: 15, color: ArenaColors.muted, height: 1.45),
    labelLarge: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, letterSpacing: 1.2),
  ),
  inputDecorationTheme: InputDecorationTheme(
    filled: true,
    fillColor: ArenaColors.surface,
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: ArenaColors.cardBorder)),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: ArenaColors.cardBorder)),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: ArenaColors.pink, width: 1.5)),
  ),
  filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(backgroundColor: ArenaColors.pink, foregroundColor: Colors.white, minimumSize: const Size.fromHeight(52), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)), textStyle: const TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1.0))),
);
